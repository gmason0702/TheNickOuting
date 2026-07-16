import type { InviteRow, ReminderStage } from "./types";

/** Tier 1's initial invite send date; each later tier follows by TIER_INTERVAL_DAYS. */
export const TIER_BASE_DATE = "2026-08-01";
export const TIER_INTERVAL_DAYS = 14;

export const EVENT_DATE = "2026-10-02";
export const FINAL_CALL_WINDOW_DAYS = 10;

export function formatEventDate(): string {
  const [y, m, d] = EVENT_DATE.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export const REMINDER_FIRST_DELAY_DAYS = 14;
export const REMINDER_SECOND_DELAY_DAYS = 14;
export const REMINDER_FLOOR_DELAY_DAYS = 4;

/** Day-only date arithmetic, in UTC, on YYYY-MM-DD strings — no time-of-day component. */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isOnOrAfter(dateStr: string, thresholdStr: string): boolean {
  return dateStr >= thresholdStr;
}

export function isFullyResponded(row: InviteRow): boolean {
  return (
    row.receptionCount !== null &&
    (row.golfRsvpCount === 0 || row.paymentStatus === "paid")
  );
}

export function tierSendDate(tier: number): string {
  return addDays(TIER_BASE_DATE, (tier - 1) * TIER_INTERVAL_DAYS);
}

/**
 * Tier 0 is a standing "send immediately, no date gate" tier for internal
 * testers -- distinct from the numbered tiers' staggered formula.
 */
export function shouldSendInitialInvite(row: InviteRow, today: string): boolean {
  if (row.golfInviteTier === null) return false;
  if (row.inviteSentAt !== null) return false;
  if (isFullyResponded(row)) return false;
  if (row.golfInviteTier === 0) return true;
  return isOnOrAfter(today, tierSendDate(row.golfInviteTier));
}

export type ReminderDecision = { send: false } | { send: true; stage: ReminderStage };

export function shouldSendReminder(row: InviteRow, today: string): ReminderDecision {
  if (row.inviteSentAt === null) return { send: false };
  if (isFullyResponded(row)) return { send: false };
  if (today > EVENT_DATE) return { send: false };

  let willSend: boolean;
  let stage: Exclude<ReminderStage, "final-call">;

  if (row.reminderCount === 0) {
    willSend = isOnOrAfter(today, addDays(row.inviteSentAt, REMINDER_FIRST_DELAY_DAYS));
    stage = "first";
  } else if (row.reminderCount === 1) {
    willSend = isOnOrAfter(
      today,
      addDays(row.lastReminderSentAt ?? row.inviteSentAt, REMINDER_SECOND_DELAY_DAYS),
    );
    stage = "second";
  } else {
    willSend = isOnOrAfter(
      today,
      addDays(row.lastReminderSentAt ?? row.inviteSentAt, REMINDER_FLOOR_DELAY_DAYS),
    );
    stage = "ongoing";
  }

  if (!willSend) return { send: false };

  const finalCallThreshold = addDays(EVENT_DATE, -FINAL_CALL_WINDOW_DAYS);
  if (today >= finalCallThreshold) return { send: true, stage: "final-call" };
  return { send: true, stage };
}
