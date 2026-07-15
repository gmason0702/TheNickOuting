import { describe, expect, it } from "vitest";
import {
  isFullyResponded,
  shouldSendInitialInvite,
  shouldSendReminder,
  tierSendDate,
} from "./cadence";
import type { InviteRow } from "./types";

function row(overrides: Partial<InviteRow> = {}): InviteRow {
  return {
    rowNumber: 2,
    name: "Test Person",
    email: "test@example.com",
    golfInviteTier: 1,
    golfRsvpCount: null,
    receptionCount: null,
    rsvpToken: "token123",
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

describe("isFullyResponded", () => {
  it("is false when reception count is blank", () => {
    expect(isFullyResponded(row({ receptionCount: null, golfRsvpCount: 0 }))).toBe(false);
  });

  it("is true for 0 golfers and a non-blank reception count", () => {
    expect(isFullyResponded(row({ receptionCount: 3, golfRsvpCount: 0 }))).toBe(true);
  });

  it("is true for 0/0 (declined everything)", () => {
    expect(isFullyResponded(row({ receptionCount: 0, golfRsvpCount: 0 }))).toBe(true);
  });

  it("is false when golfers > 0 but unpaid", () => {
    expect(
      isFullyResponded(row({ receptionCount: 4, golfRsvpCount: 2, paymentStatus: "unpaid" })),
    ).toBe(false);
  });

  it("is true when golfers > 0 and paid", () => {
    expect(
      isFullyResponded(row({ receptionCount: 4, golfRsvpCount: 2, paymentStatus: "paid" })),
    ).toBe(true);
  });
});

describe("tierSendDate", () => {
  it("tier 1 sends on the base date", () => {
    expect(tierSendDate(1)).toBe("2026-08-01");
  });

  it("tier 2 sends 14 days after tier 1", () => {
    expect(tierSendDate(2)).toBe("2026-08-15");
  });

  it("tier 3 sends 28 days after the base date", () => {
    expect(tierSendDate(3)).toBe("2026-08-29");
  });

  it("generalizes to arbitrary tiers beyond 3", () => {
    expect(tierSendDate(5)).toBe("2026-09-26");
  });
});

describe("shouldSendInitialInvite", () => {
  it("never sends when golf_invite_tier is blank", () => {
    expect(shouldSendInitialInvite(row({ golfInviteTier: null }), "2026-09-01")).toBe(false);
  });

  it("does not send before the tier's date arrives", () => {
    expect(shouldSendInitialInvite(row({ golfInviteTier: 2 }), "2026-08-14")).toBe(false);
  });

  it("sends once the tier's date arrives", () => {
    expect(shouldSendInitialInvite(row({ golfInviteTier: 2 }), "2026-08-15")).toBe(true);
  });

  it("sends after the tier's date too", () => {
    expect(shouldSendInitialInvite(row({ golfInviteTier: 1 }), "2026-09-01")).toBe(true);
  });

  it("skips a row that already has invite_sent_at set", () => {
    expect(
      shouldSendInitialInvite(row({ golfInviteTier: 1, inviteSentAt: "2026-08-01" }), "2026-09-01"),
    ).toBe(false);
  });

  it("skips a row that has already fully responded, even if its date arrived", () => {
    expect(
      shouldSendInitialInvite(
        row({ golfInviteTier: 1, receptionCount: 0, golfRsvpCount: 0 }),
        "2026-09-01",
      ),
    ).toBe(false);
  });
});

describe("shouldSendReminder", () => {
  it("skips when invite_sent_at is blank", () => {
    expect(shouldSendReminder(row({ inviteSentAt: null }), "2026-09-01")).toEqual({
      send: false,
    });
  });

  it("skips a fully-responded row", () => {
    expect(
      shouldSendReminder(
        row({ inviteSentAt: "2026-08-01", receptionCount: 2, golfRsvpCount: 0 }),
        "2026-09-01",
      ),
    ).toEqual({ send: false });
  });

  it("skips once today is past the event date, regardless of response state", () => {
    expect(
      shouldSendReminder(row({ inviteSentAt: "2026-08-01" }), "2026-10-03"),
    ).toEqual({ send: false });
  });

  it("does not send the first reminder before invite_sent_at + 14 days", () => {
    expect(
      shouldSendReminder(row({ inviteSentAt: "2026-08-01" }), "2026-08-14"),
    ).toEqual({ send: false });
  });

  it("sends the first reminder at invite_sent_at + 14 days", () => {
    expect(
      shouldSendReminder(row({ inviteSentAt: "2026-08-01" }), "2026-08-15"),
    ).toEqual({ send: true, stage: "first" });
  });

  it("does not send the second reminder before last_reminder_sent_at + 14 days", () => {
    expect(
      shouldSendReminder(
        row({ inviteSentAt: "2026-08-01", reminderCount: 1, lastReminderSentAt: "2026-08-15" }),
        "2026-08-28",
      ),
    ).toEqual({ send: false });
  });

  it("sends the second reminder at last_reminder_sent_at + 14 days", () => {
    expect(
      shouldSendReminder(
        row({ inviteSentAt: "2026-08-01", reminderCount: 1, lastReminderSentAt: "2026-08-15" }),
        "2026-08-29",
      ),
    ).toEqual({ send: true, stage: "second" });
  });

  it("sends ongoing reminders every 4 days once reminder_count >= 2", () => {
    expect(
      shouldSendReminder(
        row({ inviteSentAt: "2026-08-01", reminderCount: 2, lastReminderSentAt: "2026-08-29" }),
        "2026-09-02",
      ),
    ).toEqual({ send: true, stage: "ongoing" });
  });

  it("does not send an ongoing reminder before the 4-day floor", () => {
    expect(
      shouldSendReminder(
        row({ inviteSentAt: "2026-08-01", reminderCount: 2, lastReminderSentAt: "2026-08-29" }),
        "2026-09-01",
      ),
    ).toEqual({ send: false });
  });

  it("uses the final-call variant within 10 days of the event", () => {
    expect(
      shouldSendReminder(
        row({ inviteSentAt: "2026-08-01", reminderCount: 5, lastReminderSentAt: "2026-09-22" }),
        "2026-09-26",
      ),
    ).toEqual({ send: true, stage: "final-call" });
  });

  it("keeps reminding an unpaid golfer at the normal cadence instead of going silent", () => {
    expect(
      shouldSendReminder(
        row({
          inviteSentAt: "2026-08-01",
          reminderCount: 2,
          lastReminderSentAt: "2026-08-29",
          golfRsvpCount: 3,
          receptionCount: 5,
          paymentStatus: "unpaid",
        }),
        "2026-09-02",
      ),
    ).toEqual({ send: true, stage: "ongoing" });
  });

  it("stops immediately once a row becomes fully responded, even mid-cadence", () => {
    expect(
      shouldSendReminder(
        row({
          inviteSentAt: "2026-08-01",
          reminderCount: 2,
          lastReminderSentAt: "2026-08-29",
          golfRsvpCount: 3,
          receptionCount: 5,
          paymentStatus: "paid",
        }),
        "2026-09-02",
      ),
    ).toEqual({ send: false });
  });
});
