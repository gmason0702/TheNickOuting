import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InviteRow } from "@/lib/types";

const verifyWebhookSignature = vi.fn();
const captureOrder = vi.fn();
vi.mock("@/lib/paypal", () => ({ verifyWebhookSignature, captureOrder }));

const findRowByToken = vi.fn();
const updatePaymentStatus = vi.fn();
vi.mock("@/lib/sheets", () => ({ findRowByToken, updatePaymentStatus }));

const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({ sendEmail }));

const { POST } = await import("./route");

function row(overrides: Partial<InviteRow> = {}): InviteRow {
  return {
    rowNumber: 9,
    name: "The Frist Family",
    email: "frists@example.com",
    golfInviteTier: 1,
    golfRsvpCount: 2,
    receptionCount: 4,
    rsvpToken: "tok-frist",
    paymentStatus: "unpaid",
    paymentAmount: null,
    paidAt: null,
    paypalOrderId: null,
    inviteSentAt: "2026-08-01",
    lastReminderSentAt: null,
    reminderCount: 0,
    ...overrides,
  };
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://thenickouting.com/api/webhooks/paypal", {
    method: "POST",
    headers: {
      "paypal-transmission-id": "t1",
      "paypal-transmission-time": "2026-08-20T00:00:00Z",
      "paypal-cert-url": "https://cert",
      "paypal-auth-algo": "SHA256withRSA",
      "paypal-transmission-sig": "sig",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  verifyWebhookSignature.mockReset();
  captureOrder.mockReset();
  findRowByToken.mockReset();
  updatePaymentStatus.mockReset();
  sendEmail.mockReset();
});

describe("PayPal webhook route", () => {
  it("rejects a request with an invalid signature", async () => {
    verifyWebhookSignature.mockResolvedValue(false);

    const res = await POST(
      makeRequest({ event_type: "PAYMENT.CAPTURE.COMPLETED", resource: {} }),
    );

    expect(res.status).toBe(400);
    expect(updatePaymentStatus).not.toHaveBeenCalled();
  });

  it("acknowledges but ignores unrelated event types", async () => {
    verifyWebhookSignature.mockResolvedValue(true);

    const res = await POST(makeRequest({ event_type: "PAYMENT.CAPTURE.DENIED", resource: {} }));

    expect(res.status).toBe(200);
    expect(updatePaymentStatus).not.toHaveBeenCalled();
  });

  it("captures the order, marks payment_status=paid, and sends the paid confirmation on CHECKOUT.ORDER.APPROVED", async () => {
    verifyWebhookSignature.mockResolvedValue(true);
    findRowByToken.mockResolvedValue(row());
    captureOrder.mockResolvedValue({ status: "COMPLETED", amount: 170, captureId: "CAP1" });
    updatePaymentStatus.mockResolvedValue(undefined);

    const res = await POST(
      makeRequest({
        event_type: "CHECKOUT.ORDER.APPROVED",
        resource: { id: "ORDER1", purchase_units: [{ custom_id: "tok-frist" }] },
      }),
    );

    expect(res.status).toBe(200);
    expect(captureOrder).toHaveBeenCalledWith("ORDER1");
    expect(updatePaymentStatus).toHaveBeenCalledWith(9, {
      paymentStatus: "paid",
      paymentAmount: 170,
      paidAt: expect.any(String),
      paypalOrderId: "ORDER1",
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]?.[0]).toBe("frists@example.com");
  });

  it("marks paid directly from PAYMENT.CAPTURE.COMPLETED without an extra capture call", async () => {
    verifyWebhookSignature.mockResolvedValue(true);
    findRowByToken.mockResolvedValue(row());
    updatePaymentStatus.mockResolvedValue(undefined);

    const res = await POST(
      makeRequest({
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          custom_id: "tok-frist",
          amount: { value: "170.00" },
          supplementary_data: { related_ids: { order_id: "ORDER1" } },
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(captureOrder).not.toHaveBeenCalled();
    expect(updatePaymentStatus).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ paymentStatus: "paid", paymentAmount: 170, paypalOrderId: "ORDER1" }),
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: a webhook delivered twice for an already-paid order does not double-process", async () => {
    verifyWebhookSignature.mockResolvedValue(true);
    findRowByToken.mockResolvedValue(
      row({ paymentStatus: "paid", paypalOrderId: "ORDER1", paidAt: "2026-08-20T00:00:00.000Z" }),
    );

    const res = await POST(
      makeRequest({
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          custom_id: "tok-frist",
          amount: { value: "170.00" },
          supplementary_data: { related_ids: { order_id: "ORDER1" } },
        },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alreadyProcessed).toBe(true);
    expect(captureOrder).not.toHaveBeenCalled();
    expect(updatePaymentStatus).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("adds a top-up payment to the running total instead of overwriting it, for a new order on an already-paid row", async () => {
    verifyWebhookSignature.mockResolvedValue(true);
    findRowByToken.mockResolvedValue(
      row({ paymentStatus: "paid", paymentAmount: 100, paypalOrderId: "ORDER1" }),
    );
    updatePaymentStatus.mockResolvedValue(undefined);

    const res = await POST(
      makeRequest({
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          custom_id: "tok-frist",
          amount: { value: "50.00" },
          supplementary_data: { related_ids: { order_id: "ORDER2" } },
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(updatePaymentStatus).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ paymentStatus: "paid", paymentAmount: 150, paypalOrderId: "ORDER2" }),
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for a webhook whose token doesn't match any row", async () => {
    verifyWebhookSignature.mockResolvedValue(true);
    findRowByToken.mockResolvedValue(null);

    const res = await POST(
      makeRequest({
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          custom_id: "unknown-token",
          amount: { value: "170.00" },
          supplementary_data: { related_ids: { order_id: "ORDER1" } },
        },
      }),
    );

    expect(res.status).toBe(404);
    expect(updatePaymentStatus).not.toHaveBeenCalled();
  });
});
