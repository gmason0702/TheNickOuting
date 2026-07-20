export interface InviteRow {
  /** 1-indexed row number in the sheet, including the header row. */
  rowNumber: number;
  name: string;
  email: string;
  golfInviteTier: number | null;
  golfRsvpCount: number | null;
  receptionCount: number | null;
  rsvpToken: string;
  paymentStatus: "unpaid" | "paid";
  paymentAmount: number | null;
  paidAt: string | null;
  paypalOrderId: string | null;
  inviteSentAt: string | null;
  lastReminderSentAt: string | null;
  reminderCount: number;
  paymentRequestSentAt: string | null;
}

export type ReminderStage = "first" | "second" | "ongoing" | "final-call";
