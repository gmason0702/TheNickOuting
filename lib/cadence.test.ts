import { describe, expect, it } from "vitest";
import {
  formatClockTime,
  hasResponded,
  shouldSendInitialInvite,
  shouldSendPaymentRequest,
  shouldSendReminder,
  tierSendDate,
} from "./cadence";
import type { InviteRow } from "./types";

describe("formatClockTime", () => {
  it("formats an afternoon on-the-hour time", () => {
    expect(formatClockTime("14:00")).toBe("2pm");
  });

  it("formats a time with minutes", () => {
    expect(formatClockTime("18:30")).toBe("6:30pm");
  });

  it("formats noon and midnight correctly", () => {
    expect(formatClockTime("12:00")).toBe("12pm");
    expect(formatClockTime("00:00")).toBe("12am");
  });

  it("formats a morning time", () => {
    expect(formatClockTime("09:15")).toBe("9:15am");
  });
});

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
    paymentRequestSentAt: null,
    ...overrides,
  };
}

describe("hasResponded", () => {
  it("is false when reception count is blank", () => {
    expect(hasResponded(row({ receptionCount: null, golfRsvpCount: 0 }))).toBe(false);
  });

  it("is true for 0 golfers and a non-blank reception count", () => {
    expect(hasResponded(row({ receptionCount: 3, golfRsvpCount: 0 }))).toBe(true);
  });

  it("is true for 0/0 (declined everything)", () => {
    expect(hasResponded(row({ receptionCount: 0, golfRsvpCount: 0 }))).toBe(true);
  });

  it("is true when golfers > 0, regardless of payment status -- responding and paying are separate concerns", () => {
    expect(
      hasResponded(row({ receptionCount: 4, golfRsvpCount: 2, paymentStatus: "unpaid" })),
    ).toBe(true);
    expect(
      hasResponded(row({ receptionCount: 4, golfRsvpCount: 2, paymentStatus: "paid" })),
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

  it("tier 0 sends immediately, ignoring the staggered date formula", () => {
    expect(shouldSendInitialInvite(row({ golfInviteTier: 0 }), "2026-07-16")).toBe(true);
  });

  it("tier 0 still skips a row that already has invite_sent_at set", () => {
    expect(
      shouldSendInitialInvite(
        row({ golfInviteTier: 0, inviteSentAt: "2026-07-16" }),
        "2026-07-16",
      ),
    ).toBe(false);
  });

  it("tier 0 still skips a row that has already fully responded", () => {
    expect(
      shouldSendInitialInvite(
        row({ golfInviteTier: 0, receptionCount: 0, golfRsvpCount: 0 }),
        "2026-07-16",
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

  it("stops reminding a golfer the moment they respond, even unpaid -- the payment-request email takes over from there", () => {
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
    ).toEqual({ send: false });
  });

  it("stops immediately once a row responds, even mid-cadence and even if paid", () => {
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

describe("shouldSendPaymentRequest", () => {
  it("does not send if they haven't responded yet", () => {
    expect(shouldSendPaymentRequest(row({ receptionCount: null }), 50, 20)).toEqual({
      send: false,
    });
  });

  it("does not send if already sent", () => {
    expect(
      shouldSendPaymentRequest(
        row({ golfRsvpCount: 1, receptionCount: 1, paymentRequestSentAt: "2026-08-20" }),
        50,
        20,
      ),
    ).toEqual({ send: false });
  });

  it("does not send when nothing is owed (declined everything)", () => {
    expect(
      shouldSendPaymentRequest(row({ golfRsvpCount: 0, receptionCount: 0 }), 50, 20),
    ).toEqual({ send: false });
  });

  it("does not send once fully paid", () => {
    expect(
      shouldSendPaymentRequest(
        row({
          golfRsvpCount: 1,
          receptionCount: 1,
          paymentStatus: "paid",
          paymentAmount: 50,
        }),
        50,
        20,
      ),
    ).toEqual({ send: false });
  });

  it("sends with the correct amount due for an unpaid balance", () => {
    expect(
      shouldSendPaymentRequest(row({ golfRsvpCount: 1, receptionCount: 2 }), 50, 20),
    ).toEqual({ send: true, amountDue: 70 });
  });

  it("sends the remaining balance when previously paid less than the current total", () => {
    expect(
      shouldSendPaymentRequest(
        row({
          golfRsvpCount: 3,
          receptionCount: 0,
          paymentStatus: "paid",
          paymentAmount: 100,
        }),
        50,
        20,
      ),
    ).toEqual({ send: true, amountDue: 50 });
  });
});
