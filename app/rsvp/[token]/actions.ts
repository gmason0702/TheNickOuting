"use server";

import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import * as paypal from "@/lib/paypal";
import { calculateTotal } from "@/lib/pricing";
import * as sheets from "@/lib/sheets";
import { confirmationFreeEmail, confirmationPaymentPendingEmail } from "@/lib/templates";

export type SubmitRsvpResult =
  | { status: "not-found" }
  | { status: "confirmed"; golferCount: number; receptionCount: number }
  | { status: "confirmed-payment-pending"; golferCount: number; receptionCount: number }
  | { status: "redirect"; approveUrl: string };

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export async function submitRsvp(
  token: string,
  golferCount: number,
  receptionCount: number,
): Promise<SubmitRsvpResult> {
  if (!isNonNegativeInteger(golferCount) || !isNonNegativeInteger(receptionCount)) {
    throw new Error("Headcounts must be non-negative integers");
  }

  const row = await sheets.findRowByToken(token);
  if (!row) return { status: "not-found" };

  await sheets.updateRsvpCounts(row.rowNumber, golferCount, receptionCount);

  const total = calculateTotal(golferCount, receptionCount, env.perGolferFee, env.perReceptionFee);
  const rsvpLink = `${env.siteUrl}/rsvp/${token}`;

  if (total === 0) {
    await sendEmail(
      row.email,
      confirmationFreeEmail({ name: row.name, rsvpLink, receptionCount }),
    );
    return { status: "confirmed", golferCount, receptionCount };
  }

  if (!env.paypalEnabled) {
    await sendEmail(
      row.email,
      confirmationPaymentPendingEmail({ name: row.name, golferCount, receptionCount }),
    );
    return { status: "confirmed-payment-pending", golferCount, receptionCount };
  }

  const order = await paypal.createOrder({
    token,
    amount: total,
    returnUrl: `${env.siteUrl}/rsvp/${token}/confirmed`,
    cancelUrl: `${env.siteUrl}/rsvp/${token}`,
  });

  return { status: "redirect", approveUrl: order.approveUrl };
}
