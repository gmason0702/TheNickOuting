import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InviteRow } from "@/lib/types";

const getAllRows = vi.fn();
const updateInviteSent = vi.fn();
const updateReminder = vi.fn();
const updatePaymentRequestSent = vi.fn();
vi.mock("@/lib/sheets", () => ({
  getAllRows,
  updateInviteSent,
  updateReminder,
  updatePaymentRequestSent,
}));

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
    paymentRequestSentAt: null,
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
  updatePaymentRequestSent.mockReset();
  sendEmail.mockReset();
  sendEmail.mockResolvedValue(undefined);
  updateInviteSent.mockResolvedValue(undefined);
  updateReminder.mockResolvedValue(undefined);
  updatePaymentRequestSent.mockResolvedValue(undefined);
  process.env.AUTOMATED_SENDING_ENABLED = "true";
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.CRON_SECRET;
  delete process.env.AUTOMATED_SENDING_ENABLED;
  delete process.env.PAYPAL_ENABLED;
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

  it("is a no-op by default (AUTOMATED_SENDING_ENABLED unset) even with eligible rows", async () => {
    delete process.env.AUTOMATED_SENDING_ENABLED;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T00:00:00Z"));
    getAllRows.mockResolvedValue([row({ golfInviteTier: 1 })]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      disabled: true,
      invitesSent: 0,
      remindersSent: 0,
      paymentRequestsSent: 0,
      errors: [],
    });
    expect(getAllRows).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("stays a no-op when AUTOMATED_SENDING_ENABLED is set to something other than the literal string 'true'", async () => {
    process.env.AUTOMATED_SENDING_ENABLED = "1";
    getAllRows.mockResolvedValue([row({ golfInviteTier: 1 })]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.disabled).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
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

  it("stops RSVP reminders for a golfer who entered a count but never paid -- the payment-request email takes over instead", async () => {
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

    expect(body.remindersSent).toBe(0);
    // PAYPAL_ENABLED defaults on, so the same run's payment-request check fires instead.
    expect(body.paymentRequestsSent).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("stops reminding a row on the very next run once it becomes fully responded and paid", async () => {
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
        paymentAmount: 210,
      }),
    ]);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(body.remindersSent).toBe(0);
    expect(body.paymentRequestsSent).toBe(0);
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

  describe("payment-request email", () => {
    it("sends once for a responded, unpaid row with a balance due, and marks payment_request_sent_at", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-02T00:00:00Z"));

      getAllRows.mockResolvedValue([
        row({ inviteSentAt: "2026-08-01", golfRsvpCount: 1, receptionCount: 2 }),
      ]);

      const res = await GET(makeRequest());
      const body = await res.json();

      expect(body.paymentRequestsSent).toBe(1);
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail.mock.calls[0]?.[0]).toBe("test@example.com");
      expect(sendEmail.mock.calls[0]?.[1].subject).toMatch(/payment is open/i);
      expect(updatePaymentRequestSent).toHaveBeenCalledWith(2, "2026-09-02");
    });

    it("skips when PAYPAL_ENABLED=false", async () => {
      process.env.PAYPAL_ENABLED = "false";
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-02T00:00:00Z"));

      getAllRows.mockResolvedValue([
        row({ inviteSentAt: "2026-08-01", golfRsvpCount: 1, receptionCount: 2 }),
      ]);

      const res = await GET(makeRequest());
      const body = await res.json();

      expect(body.paymentRequestsSent).toBe(0);
      expect(sendEmail).not.toHaveBeenCalled();
      expect(updatePaymentRequestSent).not.toHaveBeenCalled();
    });

    it("skips a row that's already been sent a payment request", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-02T00:00:00Z"));

      getAllRows.mockResolvedValue([
        row({
          inviteSentAt: "2026-08-01",
          golfRsvpCount: 1,
          receptionCount: 2,
          paymentRequestSentAt: "2026-08-25",
        }),
      ]);

      const res = await GET(makeRequest());
      const body = await res.json();

      expect(body.paymentRequestsSent).toBe(0);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("skips a row with nothing owed", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-02T00:00:00Z"));

      getAllRows.mockResolvedValue([
        row({ inviteSentAt: "2026-08-01", golfRsvpCount: 0, receptionCount: 0 }),
      ]);

      const res = await GET(makeRequest());
      const body = await res.json();

      expect(body.paymentRequestsSent).toBe(0);
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });
});
