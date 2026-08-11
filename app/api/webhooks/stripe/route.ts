import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import * as stripeLib from "@/lib/stripe";
import * as sheets from "@/lib/sheets";
import { confirmationPaidEmail } from "@/lib/templates";
import type Stripe from "stripe";

const HANDLED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
]);

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripeLib.constructWebhookEvent(rawBody, request.headers.get("stripe-signature") ?? "");
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  if (!HANDLED_EVENT_TYPES.has(event.type)) {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    return NextResponse.json({ received: true, notYetPaid: true });
  }

  const { token, amount, sessionId } = stripeLib.extractPaymentDetails(session);
  if (!token) {
    return NextResponse.json({ error: "missing token" }, { status: 400 });
  }

  const row = await sheets.findRowByToken(token);
  if (!row) {
    return NextResponse.json({ error: "unknown token" }, { status: 404 });
  }

  if (row.paymentStatus === "paid" && row.paymentReference === sessionId) {
    return NextResponse.json({ received: true, alreadyProcessed: true });
  }

  const previouslyPaid = row.paymentStatus === "paid" ? row.paymentAmount ?? 0 : 0;

  await sheets.updatePaymentStatus(row.rowNumber, {
    paymentStatus: "paid",
    paymentAmount: previouslyPaid + amount,
    paidAt: new Date().toISOString(),
    paymentReference: sessionId,
  });

  await sendEmail(
    row.email,
    confirmationPaidEmail({
      name: row.name,
      golferCount: row.golfRsvpCount ?? 0,
      receptionCount: row.receptionCount ?? 0,
    }),
  );

  return NextResponse.json({ received: true });
}
