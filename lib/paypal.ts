import { env } from "./env";

function baseUrl(): string {
  return env.paypalMode === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function getAccessToken(): Promise<string> {
  const res = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${env.paypalClientId}:${env.paypalClientSecret}`,
      ).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

export interface CreateOrderParams {
  token: string;
  amount: number;
  returnUrl: string;
  cancelUrl: string;
}

export interface CreatedOrder {
  orderId: string;
  approveUrl: string;
}

export async function createOrder(params: CreateOrderParams): Promise<CreatedOrder> {
  const accessToken = await getAccessToken();
  const total = params.amount.toFixed(2);

  const res = await fetch(`${baseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: params.token,
          amount: { currency_code: "USD", value: total },
          payee: { email_address: env.paypalPayeeEmail },
        },
      ],
      application_context: {
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
        user_action: "PAY_NOW",
      },
    }),
  });

  if (!res.ok) throw new Error(`PayPal order creation failed: ${res.status}`);
  const data = await res.json();
  const approveLink = (data.links as Array<{ rel: string; href: string }>).find(
    (l) => l.rel === "approve",
  );
  if (!approveLink) throw new Error("PayPal order response missing approve link");

  return { orderId: data.id, approveUrl: approveLink.href };
}

export interface CapturedOrder {
  status: string;
  amount: number;
  captureId: string;
}

export async function captureOrder(orderId: string): Promise<CapturedOrder> {
  const accessToken = await getAccessToken();
  const res = await fetch(`${baseUrl()}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) throw new Error(`PayPal order capture failed: ${res.status}`);
  const data = await res.json();
  const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture) throw new Error("PayPal capture response missing capture details");

  return {
    status: data.status,
    amount: parseFloat(capture.amount.value),
    captureId: capture.id,
  };
}

export interface WebhookVerification {
  transmissionId: string;
  transmissionTime: string;
  certUrl: string;
  authAlgo: string;
  transmissionSig: string;
  body: string;
}

export async function verifyWebhookSignature(
  verification: WebhookVerification,
): Promise<boolean> {
  const accessToken = await getAccessToken();
  const res = await fetch(`${baseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      transmission_id: verification.transmissionId,
      transmission_time: verification.transmissionTime,
      cert_url: verification.certUrl,
      auth_algo: verification.authAlgo,
      transmission_sig: verification.transmissionSig,
      webhook_id: env.paypalWebhookId,
      webhook_event: JSON.parse(verification.body),
    }),
  });

  if (!res.ok) return false;
  const data = await res.json();
  return data.verification_status === "SUCCESS";
}
