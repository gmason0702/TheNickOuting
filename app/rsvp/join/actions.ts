"use server";

import { MAX_GOLFERS } from "@/lib/capacity";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import * as paypal from "@/lib/paypal";
import { calculateTotal } from "@/lib/pricing";
import { assertValidHeadcounts } from "@/lib/rsvpValidation";
import * as sheets from "@/lib/sheets";
import { confirmationFreeEmail, confirmationPaymentPendingEmail } from "@/lib/templates";

export type SubmitJoinResult =
  | { status: "closed" }
  | { status: "confirmed"; golferCount: number; receptionCount: number; rsvpLink: string }
  | {
      status: "confirmed-payment-pending";
      golferCount: number;
      receptionCount: number;
      amountDue: number;
      rsvpLink: string;
    }
  | { status: "redirect"; approveUrl: string };

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function submitJoin(
  name: string,
  email: string,
  golferCount: number,
  receptionCount: number,
): Promise<SubmitJoinResult> {
  if (!env.walkinEnabled) return { status: "closed" };

  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("Name is required.");
  if (!isValidEmail(email)) throw new Error("Enter a valid email address.");
  assertValidHeadcounts(golferCount, receptionCount);

  if (golferCount > 0) {
    const totalGolfers = await sheets.getTotalGolferCount();
    if (totalGolfers >= MAX_GOLFERS) {
      throw new Error("Golf is at maximum capacity — you can still RSVP for the reception.");
    }
  }

  const token = await sheets.generateUniqueToken();
  const rowNumber = await sheets.appendRow({ name: trimmedName, email, rsvpToken: token });
  await sheets.updateRsvpCounts(rowNumber, golferCount, receptionCount);

  const total = calculateTotal(golferCount, receptionCount, env.perGolferFee, env.perReceptionFee);
  const rsvpLink = `${env.siteUrl}/rsvp/${token}`;

  if (total <= 0) {
    await sendEmail(
      email,
      confirmationFreeEmail({
        name: trimmedName,
        rsvpLink,
        golferCount,
        receptionCount,
        refundNote: false,
      }),
    );
    return { status: "confirmed", golferCount, receptionCount, rsvpLink };
  }

  if (!env.paypalEnabled) {
    await sendEmail(
      email,
      confirmationPaymentPendingEmail({
        name: trimmedName,
        rsvpLink,
        golferCount,
        receptionCount,
        amountDue: total,
      }),
    );
    return { status: "confirmed-payment-pending", golferCount, receptionCount, amountDue: total, rsvpLink };
  }

  // Once appended, this row is an ordinary invite row -- an abandoned/failed
  // checkout falls back to the existing per-token page (same as any other
  // invite), not back to the join form, so a retry never creates a duplicate row.
  const order = await paypal.createOrder({
    token,
    amount: total,
    returnUrl: `${env.siteUrl}/rsvp/${token}/confirmed`,
    cancelUrl: `${env.siteUrl}/rsvp/${token}`,
  });

  return { status: "redirect", approveUrl: order.approveUrl };
}
