import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InviteRow } from "@/lib/types";

const getAllRows = vi.fn();
const updateInviteSent = vi.fn();
const updateReminder = vi.fn();
vi.mock("@/lib/sheets", () => ({ getAllRows, updateInviteSent, updateReminder }));

const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({ sendEmail }));

const { GET } = await import("./route");

function row(overrides: Partial<InviteRow> = {}): InviteRow {
  return {
    rowNumber: 2,
    name: "Test Person",
    email: "test@example.com",
    golfInviteTier: 1,
    golfRsvpCount: null,
    receptionCount: null,
    rsvpToken: "tok",
    paymentStatus: "unpaid",
    paymentAmount: null,
    paidAt: null,
    paypalOrderId: null,
    inviteSentAt: null,
    lastReminderSentAt: null,
    reminderCount: 0,
    ...overrides,
  };
}

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://thenickouting.com/api/cron/daily", {
    method: "GET",
    headers,
  });
}

beforeEach(() => {
  getAllRows.mockReset();
  updateInviteSent.mockReset();
  updateReminder.mockReset();
  sendEmail.mockReset();
  sendEmail.mockResolvedValue(undefined);
  updateInviteSent.mockResolvedValue(undefined);
  updateReminder.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.CRON_SECRET;
});

describe("daily cron route", () => {
  it("requires the cron secret when configured", async () => {
    process.env.CRON_SECRET = "shh";
    getAllRows.mockResolvedValue([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(getAllRows).not.toHaveBeenCalled();
  });

  it("accepts the request with a matching bearer token", async () => {
    process.env.CRON_SECRET = "shh";
    getAllRows.mockResolvedValue([]);

    const res = await GET(makeRequest({ authorization: "Bearer shh" }));
    expect(res.status).toBe(200);
  });

  it("sends a tier's initial invite once its date arrives and skips a blank-tier row", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T12:00:00Z"));

    getAllRows.mockResolvedValue([
      row({ rowNumber: 2, golfInviteTier: 2, rsvpToken: "tier2" }),
      row({ rowNumber: 3, golfInviteTier: null, rsvpToken: "no-tier" }),
    ]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.invitesSent).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]?.[0]).toBe("test@example.com");
    expect(updateInviteSent).toHaveBeenCalledWith(2, "2026-08-15");
    expect(updateInviteSent).not.toHaveBeenCalledWith(3, expect.anything());
  });

  it("skips a row that already fully responded even if its tier's date arrived", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T00:00:00Z"));

    getAllRows.mockResolvedValue([
      row({ golfInviteTier: 1, golfRsvpCount: 0, receptionCount: 0 }),
    ]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.invitesSent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends the first reminder 14 days after invite_sent_at and records reminder_count/last_reminder_sent_at", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T00:00:00Z"));

    getAllRows.mockResolvedValue([row({ inviteSentAt: "2026-08-01", reminderCount: 0 })]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.remindersSent).toBe(1);
    expect(updateReminder).toHaveBeenCalledWith(2, {
      lastReminderSentAt: "2026-08-15",
      reminderCount: 1,
    });
  });

  it("keeps reminding a golfer who entered a count but never paid, at the normal cadence", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T00:00:00Z"));

    getAllRows.mockResolvedValue([
      row({
        inviteSentAt: "2026-08-01",
        reminderCount: 2,
        lastReminderSentAt: "2026-08-29",
        golfRsvpCount: 2,
        receptionCount: 4,
        paymentStatus: "unpaid",
      }),
    ]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.remindersSent).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("stops reminding a row on the very next run once it becomes fully responded", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T00:00:00Z"));

    getAllRows.mockResolvedValue([
      row({
        inviteSentAt: "2026-08-01",
        reminderCount: 2,
        lastReminderSentAt: "2026-08-29",
        golfRsvpCount: 2,
        receptionCount: 4,
        paymentStatus: "paid",
      }),
    ]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.remindersSent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends no reminders once today is past the event date, regardless of response state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T00:00:00Z"));

    getAllRows.mockResolvedValue([row({ inviteSentAt: "2026-08-01", reminderCount: 2 })]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.remindersSent).toBe(0);
  });

  it("uses the final-call template within 10 days of the event", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T00:00:00Z"));

    getAllRows.mockResolvedValue([
      row({ inviteSentAt: "2026-08-01", reminderCount: 5, lastReminderSentAt: "2026-09-22" }),
    ]);

    const res = await GET(makeRequest());
    await res.json();

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]?.[1].subject).toMatch(/Last call/i);
  });

  it("processes a mixed batch in one run and isolates a per-row failure without aborting the rest", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T00:00:00Z"));

    getAllRows.mockResolvedValue([
      row({ rowNumber: 2, golfInviteTier: 2, rsvpToken: "a", email: "a@example.com" }),
      row({ rowNumber: 3, golfInviteTier: 2, rsvpToken: "b", email: "b@example.com" }),
      row({ rowNumber: 4, golfInviteTier: null, rsvpToken: "c", email: "c@example.com" }),
    ]);
    sendEmail.mockImplementation(async (to: string) => {
      if (to === "a@example.com") throw new Error("resend down");
    });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.invitesSent).toBe(1);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]).toMatch(/row 2/);
    expect(updateInviteSent).toHaveBeenCalledWith(3, "2026-08-15");
    expect(updateInviteSent).not.toHaveBeenCalledWith(2, expect.anything());
  });
});
