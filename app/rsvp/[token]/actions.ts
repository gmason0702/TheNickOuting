"use server";

import { MAX_GOLFERS } from "@/lib/capacity";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import * as stripeLib from "@/lib/stripe";
import { calculateTotal } from "@/lib/pricing";
import { assertValidHeadcounts } from "@/lib/rsvpValidation";
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
  | { status: "redirect"; checkoutUrl: string };

export async function submitRsvp(
  token: string,
  golferCount: number,
  receptionCount: number,
): Promise<SubmitRsvpResult> {
  assertValidHeadcounts(golferCount, receptionCount);

  const row = await sheets.findRowByToken(token);
  if (!row) return { status: "not-found" };

  // Only block *new* golfers -- someone who's already golfing keeps their
  // spot on resubmission even if the field has since filled up around them.
  const isAddingNewGolfer = golferCount > 0 && (row.golfRsvpCount ?? 0) === 0;
  if (isAddingNewGolfer) {
    const totalGolfers = await sheets.getTotalGolferCount();
    if (totalGolfers >= MAX_GOLFERS) {
      throw new Error("Golf is at maximum capacity — you can still RSVP for the reception.");
    }
  }

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

  if (!env.stripeEnabled) {
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

  const session = await stripeLib.createCheckoutSession({
    token,
    amount: amountDue,
    customerEmail: row.email,
    returnUrl: `${env.siteUrl}/rsvp/${token}/confirmed`,
    cancelUrl: `${env.siteUrl}/rsvp/${token}`,
  });

  return { status: "redirect", checkoutUrl: session.checkoutUrl };
}
