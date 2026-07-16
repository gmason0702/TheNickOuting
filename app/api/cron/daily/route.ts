import { NextRequest, NextResponse } from "next/server";
import { shouldSendInitialInvite, shouldSendReminder } from "@/lib/cadence";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import * as sheets from "@/lib/sheets";
import {
  initialInviteEmail,
  reminderFinalCallEmail,
  reminderFirstEmail,
  reminderOngoingEmail,
  reminderSecondEmail,
} from "@/lib/templates";
import type { InviteRow, ReminderStage } from "@/lib/types";

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function reminderEmailFor(stage: ReminderStage, row: InviteRow) {
  const rsvpLink = `${env.siteUrl}/rsvp/${row.rsvpToken}`;
  switch (stage) {
    case "first":
      return reminderFirstEmail({ name: row.name, rsvpLink });
    case "second":
      return reminderSecondEmail({ name: row.name, rsvpLink });
    case "final-call":
      return reminderFinalCallEmail({ name: row.name, rsvpLink });
    case "ongoing":
      return reminderOngoingEmail({ name: row.name, rsvpLink });
  }
}

export async function GET(request: NextRequest) {
  if (env.cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${env.cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  if (!env.automatedSendingEnabled) {
    return NextResponse.json({ disabled: true, invitesSent: 0, remindersSent: 0, errors: [] });
  }

  const today = todayString();
  const rows = await sheets.getAllRows();

  let invitesSent = 0;
  let remindersSent = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      if (shouldSendInitialInvite(row, today)) {
        const rsvpLink = `${env.siteUrl}/rsvp/${row.rsvpToken}`;
        await sendEmail(
          row.email,
          initialInviteEmail({
            name: row.name,
            rsvpLink,
            golferFee: env.perGolferFee,
            receptionFee: env.perReceptionFee,
          }),
        );
        await sheets.updateInviteSent(row.rowNumber, today);
        invitesSent++;
      }

      const reminderDecision = shouldSendReminder(row, today);
      if (reminderDecision.send) {
        await sendEmail(row.email, reminderEmailFor(reminderDecision.stage, row));
        await sheets.updateReminder(row.rowNumber, {
          lastReminderSentAt: today,
          reminderCount: row.reminderCount + 1,
        });
        remindersSent++;
      }
    } catch (err) {
      errors.push(`row ${row.rowNumber}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ today, invitesSent, remindersSent, errors });
}
