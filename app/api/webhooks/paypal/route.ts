import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import * as paypal from "@/lib/paypal";
import * as sheets from "@/lib/sheets";
import { confirmationPaidEmail } from "@/lib/templates";

const HANDLED_EVENT_TYPES = new Set(["CHECKOUT.ORDER.APPROVED", "PAYMENT.CAPTURE.COMPLETED"]);

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const verified = await paypal.verifyWebhookSignature({
    transmissionId: request.headers.get("paypal-transmission-id") ?? "",
    transmissionTime: request.headers.get("paypal-transmission-time") ?? "",
    certUrl: request.headers.get("paypal-cert-url") ?? "",
    authAlgo: request.headers.get("paypal-auth-algo") ?? "",
    transmissionSig: request.headers.get("paypal-transmission-sig") ?? "",
    body: rawBody,
  });

  if (!verified) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(rawBody);
  const eventType: string = event.event_type;

  if (!HANDLED_EVENT_TYPES.has(eventType)) {
    return NextResponse.json({ received: true });
  }

  const isOrderApproved = eventType === "CHECKOUT.ORDER.APPROVED";
  const orderId: string | undefined = isOrderApproved
    ? event.resource?.id
    : event.resource?.supplementary_data?.related_ids?.order_id;
  const token: string | undefined = isOrderApproved
    ? event.resource?.purchase_units?.[0]?.custom_id
    : event.resource?.custom_id;

  if (!orderId || !token) {
    return NextResponse.json({ error: "missing order id or token" }, { status: 400 });
  }

  const row = await sheets.findRowByToken(token);
  if (!row) {
    return NextResponse.json({ error: "unknown token" }, { status: 404 });
  }

  if (row.paymentStatus === "paid" && row.paypalOrderId === orderId) {
    return NextResponse.json({ received: true, alreadyProcessed: true });
  }

  const amount = isOrderApproved
    ? (await paypal.captureOrder(orderId)).amount
    : parseFloat(event.resource.amount.value);

  const previouslyPaid = row.paymentStatus === "paid" ? row.paymentAmount ?? 0 : 0;

  await sheets.updatePaymentStatus(row.rowNumber, {
    paymentStatus: "paid",
    paymentAmount: previouslyPaid + amount,
    paidAt: new Date().toISOString(),
    paypalOrderId: orderId,
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
