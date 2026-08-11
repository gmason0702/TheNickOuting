import Stripe from "stripe";
import { env } from "./env";

function getClient(): Stripe {
  return new Stripe(env.stripeSecretKey);
}

export interface CreateCheckoutSessionParams {
  token: string;
  amount: number;
  customerEmail: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface CreatedCheckoutSession {
  sessionId: string;
  checkoutUrl: string;
}

export async function createCheckoutSession(
  params: CreateCheckoutSessionParams,
): Promise<CreatedCheckoutSession> {
  const stripe = getClient();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: params.token,
    customer_email: params.customerEmail,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: Math.round(params.amount * 100),
          product_data: { name: "Nick Jacobi Memorial Outing" },
        },
        quantity: 1,
      },
    ],
    success_url: params.returnUrl,
    cancel_url: params.cancelUrl,
  });

  if (!session.url) throw new Error("Stripe checkout session response missing url");
  return { sessionId: session.id, checkoutUrl: session.url };
}

export function constructWebhookEvent(rawBody: string, signatureHeader: string): Stripe.Event {
  const stripe = getClient();
  return stripe.webhooks.constructEvent(rawBody, signatureHeader, env.stripeWebhookSecret);
}

export interface PaymentDetails {
  token: string | null;
  amount: number;
  sessionId: string;
}

export function extractPaymentDetails(session: Stripe.Checkout.Session): PaymentDetails {
  return {
    token: session.client_reference_id,
    amount: (session.amount_total ?? 0) / 100,
    sessionId: session.id,
  };
}
