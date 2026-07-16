"use server";

import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import * as paypal from "@/lib/paypal";
import { calculateTotal } from "@/lib/pricing";
import * as sheets from "@/lib/sheets";
import { confirmationFreeEmail, confirmationPaymentPendingEmail } from "@/lib/templates";

export type SubmitRsvpResult =
  | { status: "not-found" }
  | { status: "confirmed"; golferCount: number; receptionCount: number; refundNote: boolean }
  | {
      status: "confirmed-payment-pending";
      golferCount: number;
      receptionCount: number;
      amountDue: number;
    }
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

  // Headcounts always get written, even on a decrease -- accuracy of who's
  // actually coming takes priority. Refunds for a net decrease are handled
  // manually, outside this app; only a net increase triggers a new charge,
  // and only for the difference against what's already been paid.
  await sheets.updateRsvpCounts(row.rowNumber, golferCount, receptionCount);

  const total = calculateTotal(golferCount, receptionCount, env.perGolferFee, env.perReceptionFee);
  const alreadyPaid = row.paymentStatus === "paid" ? row.paymentAmount ?? 0 : 0;
  const amountDue = total - alreadyPaid;
  const rsvpLink = `${env.siteUrl}/rsvp/${token}`;

  if (amountDue <= 0) {
    await sendEmail(
      row.email,
      confirmationFreeEmail({
        name: row.name,
        rsvpLink,
        golferCount,
        receptionCount,
        refundNote: amountDue < 0,
      }),
    );
    return { status: "confirmed", golferCount, receptionCount, refundNote: amountDue < 0 };
  }

  if (!env.paypalEnabled) {
    await sendEmail(
      row.email,
      confirmationPaymentPendingEmail({
        name: row.name,
        rsvpLink,
        golferCount,
        receptionCount,
        amountDue,
      }),
    );
    return { status: "confirmed-payment-pending", golferCount, receptionCount, amountDue };
  }

  const order = await paypal.createOrder({
    token,
    amount: amountDue,
    returnUrl: `${env.siteUrl}/rsvp/${token}/confirmed`,
    cancelUrl: `${env.siteUrl}/rsvp/${token}`,
  });

  return { status: "redirect", approveUrl: order.approveUrl };
}
