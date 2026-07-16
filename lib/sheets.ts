import { google } from "googleapis";
import { env } from "./env";
import type { InviteRow } from "./types";

/**
 * Column layout of the real `Invites List - golf_invite_list` sheet (16 columns, A-P).
 * Columns D/F/G (2026_golf_status, reception_invite, reception_status) exist in Gordon's
 * sheet but are intentionally left untouched by the app.
 */
const DATA_RANGE = "A2:P";

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
    receptionCount: parseIntOrNull(values[7]),
    rsvpToken: values[8] ?? "",
    paymentStatus: values[9] === "paid" ? "paid" : "unpaid",
    paymentAmount: parseFloatOrNull(values[10]),
    paidAt: parseStringOrNull(values[11]),
    paypalOrderId: parseStringOrNull(values[12]),
    inviteSentAt: parseStringOrNull(values[13]),
    lastReminderSentAt: parseStringOrNull(values[14]),
    reminderCount: parseIntOrNull(values[15]) ?? 0,
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

export async function updateRsvpCounts(
  rowNumber: number,
  golferCount: number,
  receptionCount: number,
): Promise<void> {
  const sheets = getClient();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: env.googleSheetId,
    requestBody: {
      valueInputOption: "RAW",
      data: [
        { range: range(`E${rowNumber}`), values: [[golferCount]] },
        { range: range(`H${rowNumber}`), values: [[receptionCount]] },
      ],
    },
  });
}

export interface PaymentUpdate {
  paymentStatus: "paid" | "unpaid";
  paymentAmount: number;
  paidAt: string;
  paypalOrderId: string;
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
        [update.paymentStatus, update.paymentAmount, update.paidAt, update.paypalOrderId],
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
