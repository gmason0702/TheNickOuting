import { randomBytes } from "crypto";
import { google } from "googleapis";
import { env } from "./env";
import type { InviteRow } from "./types";

/**
 * Column layout of the real `Invites List - golf_invite_list` sheet (18 columns, A-R).
 * Columns D/F/G (2026_golf_status, reception_invite, reception_status) exist in Gordon's
 * sheet but are intentionally left untouched by the app. Column Q (payment_request_sent_at)
 * tracks the one-time "secure your tickets" payment email, separate from invite_sent_at (N).
 * Column H (reception_adult_count) predates the adult/child split -- every row that had
 * already responded before the split keeps its count there, read as all-adult. Column R
 * (reception_child_count) is new; blank/unset reads as 0 children, same as any other row.
 */
const DATA_RANGE = "A2:R";

function quoteSheetName(name: string): string {
  return /[\s'!]/.test(name) ? `'${name.replace(/'/g, "''")}'` : name;
}

function range(a1: string): string {
  return `${quoteSheetName(env.googleSheetTabName)}!${a1}`;
}

function getAuth() {
  return new google.auth.JWT({
    email: env.googleServiceAccountEmail,
    key: env.googleServiceAccountPrivateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getClient() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

function parseIntOrNull(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

function parseFloatOrNull(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const n = parseFloat(value);
  return Number.isNaN(n) ? null : n;
}

function parseStringOrNull(value: string | undefined): string | null {
  return value === undefined || value === "" ? null : value;
}

function toInviteRow(values: string[], rowNumber: number): InviteRow {
  return {
    rowNumber,
    name: values[0] ?? "",
    email: values[1] ?? "",
    golfInviteTier: parseIntOrNull(values[2]),
    golfRsvpCount: parseIntOrNull(values[4]),
    receptionAdultCount: parseIntOrNull(values[7]),
    rsvpToken: values[8] ?? "",
    paymentStatus: values[9] === "paid" ? "paid" : "unpaid",
    paymentAmount: parseFloatOrNull(values[10]),
    paidAt: parseStringOrNull(values[11]),
    paymentReference: parseStringOrNull(values[12]),
    inviteSentAt: parseStringOrNull(values[13]),
    lastReminderSentAt: parseStringOrNull(values[14]),
    reminderCount: parseIntOrNull(values[15]) ?? 0,
    paymentRequestSentAt: parseStringOrNull(values[16]),
    receptionChildCount: parseIntOrNull(values[17]),
  };
}

export async function getAllRows(): Promise<InviteRow[]> {
  const sheets = getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: env.googleSheetId,
    range: range(DATA_RANGE),
  });
  const rows = res.data.values ?? [];
  return rows.map((values, i) => toInviteRow(values as string[], i + 2));
}

export async function findRowByToken(token: string): Promise<InviteRow | null> {
  if (!token) return null;
  const rows = await getAllRows();
  return rows.find((r) => r.rsvpToken !== "" && r.rsvpToken === token) ?? null;
}

export async function getTotalGolferCount(): Promise<number> {
  const rows = await getAllRows();
  return rows.reduce((sum, r) => sum + (r.golfRsvpCount ?? 0), 0);
}

/** Mints a fresh 128-bit rsvp_token, retrying on the vanishingly unlikely collision. */
export async function generateUniqueToken(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = randomBytes(16).toString("base64url");
    if (!(await findRowByToken(token))) return token;
  }
  throw new Error("Failed to generate a unique RSVP token after 5 attempts");
}

export interface NewInvite {
  name: string;
  email: string;
  rsvpToken: string;
}

/**
 * Appends a brand-new walk-in row: name/email/token are known up front, everything
 * else starts blank/default (no golf_invite_tier — walk-ins never enter the tiered
 * invite/reminder cadence) exactly like an untouched imported row. Headcounts are
 * written separately via updateRsvpCounts, reusing that already-targeted write.
 *
 * Writes to an explicitly-computed row/column range rather than using the Sheets
 * API's values.append, whose "find the table" heuristic can misalign to a stray
 * far-right column if there's any other content (e.g. manual notes) below the
 * real data within the A:R search range.
 */
export async function appendRow(newInvite: NewInvite): Promise<number> {
  const sheets = getClient();
  const existingRows = await getAllRows();
  const rowNumber = existingRows.length + 2;

  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: range(`A${rowNumber}:R${rowNumber}`),
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [
          newInvite.name, // A name
          newInvite.email, // B email
          "", // C golf_invite_tier
          "", // D 2026_golf_status (untouched)
          "", // E golf_rsvp_count
          "", // F reception_invite (untouched)
          "", // G reception_status (untouched)
          "", // H reception_count
          newInvite.rsvpToken, // I rsvp_token
          "unpaid", // J payment_status
          "", // K payment_amount
          "", // L paid_at
          "", // M payment_reference
          "", // N invite_sent_at
          "", // O last_reminder_sent_at
          0, // P reminder_count
          "", // Q payment_request_sent_at
          "", // R reception_child_count
        ],
      ],
    },
  });

  return rowNumber;
}

export async function updateRsvpCounts(
  rowNumber: number,
  golferCount: number,
  receptionAdultCount: number,
  receptionChildCount: number,
): Promise<void> {
  const sheets = getClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: env.googleSheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: range(`E${rowNumber}`), values: [[golferCount]] },
        { range: range(`H${rowNumber}`), values: [[receptionAdultCount]] },
        { range: range(`R${rowNumber}`), values: [[receptionChildCount]] },
      ],
    },
  });
}

export interface PaymentUpdate {
  paymentStatus: "paid" | "unpaid";
  paymentAmount: number;
  paidAt: string;
  paymentReference: string;
}

export async function updatePaymentStatus(
  rowNumber: number,
  update: PaymentUpdate,
): Promise<void> {
  const sheets = getClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: range(`J${rowNumber}:M${rowNumber}`),
    valueInputOption: "RAW",
    requestBody: {
      values: [
        [update.paymentStatus, update.paymentAmount, update.paidAt, update.paymentReference],
      ],
    },
  });
}

export async function updateInviteSent(rowNumber: number, date: string): Promise<void> {
  const sheets = getClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: range(`N${rowNumber}`),
    valueInputOption: "RAW",
    requestBody: { values: [[date]] },
  });
}

export async function updatePaymentRequestSent(rowNumber: number, date: string): Promise<void> {
  const sheets = getClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: range(`Q${rowNumber}`),
    valueInputOption: "RAW",
    requestBody: { values: [[date]] },
  });
}

export interface ReminderUpdate {
  lastReminderSentAt: string;
  reminderCount: number;
}

export async function updateReminder(
  rowNumber: number,
  update: ReminderUpdate,
): Promise<void> {
  const sheets = getClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetId,
    range: range(`O${rowNumber}:P${rowNumber}`),
    valueInputOption: "RAW",
    requestBody: { values: [[update.lastReminderSentAt, update.reminderCount]] },
  });
}
