import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.PAYPAL_CLIENT_ID = "client-id";
process.env.PAYPAL_CLIENT_SECRET = "client-secret";
process.env.PAYPAL_MODE = "sandbox";
process.env.PAYPAL_WEBHOOK_ID = "webhook-id";
process.env.PAYPAL_PAYEE_EMAIL = "payee@example.com";

const { captureOrder, createOrder, verifyWebhookSignature } = await import("./paypal");

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
});

function mockAuthThen(...responses: Response[]) {
  fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: "fake-token" }));
  for (const r of responses) fetchMock.mockResolvedValueOnce(r);
}

describe("createOrder", () => {
  it("creates an order for the given amount and returns the approve link", async () => {
    mockAuthThen(
      jsonResponse({
        id: "ORDER1",
        links: [
          { rel: "self", href: "https://sandbox/self" },
          { rel: "approve", href: "https://sandbox/approve/ORDER1" },
        ],
      }),
    );

    const result = await createOrder({
      token: "tok-abc",
      amount: 70,
      returnUrl: "https://site/rsvp/tok-abc/confirmed",
      cancelUrl: "https://site/rsvp/tok-abc",
    });

    expect(result).toEqual({ orderId: "ORDER1", approveUrl: "https://sandbox/approve/ORDER1" });

    const orderCall = fetchMock.mock.calls[1];
    const body = JSON.parse(orderCall![1].body);
    expect(body.purchase_units[0].amount.value).toBe("70.00");
    expect(body.purchase_units[0].custom_id).toBe("tok-abc");
    expect(body.purchase_units[0].payee.email_address).toBe("payee@example.com");
  });

  it("throws if PayPal does not return an approve link", async () => {
    mockAuthThen(jsonResponse({ id: "ORDER1", links: [] }));
    await expect(
      createOrder({
        token: "tok-abc",
        amount: 50,
        returnUrl: "https://site/return",
        cancelUrl: "https://site/cancel",
      }),
    ).rejects.toThrow();
  });
});

describe("captureOrder", () => {
  it("captures the order and returns the captured amount", async () => {
    mockAuthThen(
      jsonResponse({
        status: "COMPLETED",
        purchase_units: [
          { payments: { captures: [{ id: "CAPTURE1", amount: { value: "170.00" } }] } },
        ],
      }),
    );

    const result = await captureOrder("ORDER1");
    expect(result).toEqual({ status: "COMPLETED", amount: 170, captureId: "CAPTURE1" });
  });
});

describe("verifyWebhookSignature", () => {
  it("returns true when PayPal reports SUCCESS", async () => {
    mockAuthThen(jsonResponse({ verification_status: "SUCCESS" }));

    const result = await verifyWebhookSignature({
      transmissionId: "t1",
      transmissionTime: "2026-08-20T00:00:00Z",
      certUrl: "https://cert",
      authAlgo: "SHA256withRSA",
      transmissionSig: "sig",
      body: JSON.stringify({ event_type: "PAYMENT.CAPTURE.COMPLETED" }),
    });

    expect(result).toBe(true);
  });

  it("returns false when PayPal reports FAILURE", async () => {
    mockAuthThen(jsonResponse({ verification_status: "FAILURE" }));

    const result = await verifyWebhookSignature({
      transmissionId: "t1",
      transmissionTime: "2026-08-20T00:00:00Z",
      certUrl: "https://cert",
      authAlgo: "SHA256withRSA",
      transmissionSig: "bad-sig",
      body: JSON.stringify({ event_type: "PAYMENT.CAPTURE.COMPLETED" }),
    });

    expect(result).toBe(false);
  });

  it("returns false when the verification request itself fails", async () => {
    mockAuthThen(jsonResponse({}, false, 500));

    const result = await verifyWebhookSignature({
      transmissionId: "t1",
      transmissionTime: "2026-08-20T00:00:00Z",
      certUrl: "https://cert",
      authAlgo: "SHA256withRSA",
      transmissionSig: "sig",
      body: JSON.stringify({ event_type: "PAYMENT.CAPTURE.COMPLETED" }),
    });

    expect(result).toBe(false);
  });
});
