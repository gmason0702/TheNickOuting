"use server";

import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import * as paypal from "@/lib/paypal";
import * as sheets from "@/lib/sheets";
import { confirmationFreeEmail } from "@/lib/templates";

export type SubmitRsvpResult =
  | { status: "not-found" }
  | { status: "confirmed"; golferCount: number; receptionCount: number }
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

  if (golferCount === 0) {
    const rsvpLink = `${env.siteUrl}/rsvp/${token}`;
    await sendEmail(
      row.email,
      confirmationFreeEmail({ name: row.name, rsvpLink, receptionCount }),
    );
    return { status: "confirmed", golferCount, receptionCount };
  }

  const order = await paypal.createOrder({
    token,
    golferCount,
    feePerGolfer: env.perGolferFee,
    returnUrl: `${env.siteUrl}/rsvp/${token}/confirmed`,
    cancelUrl: `${env.siteUrl}/rsvp/${token}`,
  });

  return { status: "redirect", approveUrl: order.approveUrl };
}
