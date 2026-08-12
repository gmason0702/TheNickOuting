import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InviteRow } from "@/lib/types";

const constructWebhookEvent = vi.fn();
const extractPaymentDetails = vi.fn();
vi.mock("@/lib/stripe", () => ({ constructWebhookEvent, extractPaymentDetails }));

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
    receptionAdultCount: 4,
    receptionChildCount: 0,
    rsvpToken: "tok-frist",
    paymentStatus: "unpaid",
    paymentAmount: null,
    paidAt: null,
    paymentReference: null,
    inviteSentAt: "2026-08-01",
    lastReminderSentAt: null,
    reminderCount: 0,
    paymentRequestSentAt: null,
    ...overrides,
  };
}

function makeRequest(body: unknown, signature = "sig"): NextRequest {
  return new NextRequest("https://thenickouting.com/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: JSON.stringify(body),
  });
}

function sessionEvent(type: string, session: Record<string, unknown>) {
  return { type, data: { object: session } };
}

beforeEach(() => {
  constructWebhookEvent.mockReset();
  extractPaymentDetails.mockReset();
  findRowByToken.mockReset();
  updatePaymentStatus.mockReset();
  sendEmail.mockReset();
});

describe("Stripe webhook route", () => {
  it("rejects a request with an invalid signature", async () => {
    constructWebhookEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    expect(updatePaymentStatus).not.toHaveBeenCalled();
  });

  it("acknowledges but ignores unrelated event types", async () => {
    constructWebhookEvent.mockReturnValue(sessionEvent("payment_intent.created", {}));

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(200);
    expect(updatePaymentStatus).not.toHaveBeenCalled();
  });

  it("acknowledges but does not process a session that hasn't actually paid yet", async () => {
    constructWebhookEvent.mockReturnValue(
      sessionEvent("checkout.session.completed", { payment_status: "unpaid" }),
    );

    const res = await POST(makeRequest({}));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.notYetPaid).toBe(true);
    expect(updatePaymentStatus).not.toHaveBeenCalled();
  });

  it("marks payment_status=paid and sends the paid confirmation on checkout.session.completed", async () => {
    constructWebhookEvent.mockReturnValue(
      sessionEvent("checkout.session.completed", { payment_status: "paid" }),
    );
    extractPaymentDetails.mockReturnValue({ token: "tok-frist", amount: 170, sessionId: "cs_1" });
    findRowByToken.mockResolvedValue(row());
    updatePaymentStatus.mockResolvedValue(undefined);

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(200);
    expect(updatePaymentStatus).toHaveBeenCalledWith(9, {
      paymentStatus: "paid",
      paymentAmount: 170,
      paidAt: expect.any(String),
      paymentReference: "cs_1",
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]?.[0]).toBe("frists@example.com");
  });

  it("also processes checkout.session.async_payment_succeeded", async () => {
    constructWebhookEvent.mockReturnValue(
      sessionEvent("checkout.session.async_payment_succeeded", { payment_status: "paid" }),
    );
    extractPaymentDetails.mockReturnValue({ token: "tok-frist", amount: 170, sessionId: "cs_1" });
    findRowByToken.mockResolvedValue(row());
    updatePaymentStatus.mockResolvedValue(undefined);

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(200);
    expect(updatePaymentStatus).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: a webhook delivered twice for an already-paid session does not double-process", async () => {
    constructWebhookEvent.mockReturnValue(
      sessionEvent("checkout.session.completed", { payment_status: "paid" }),
    );
    extractPaymentDetails.mockReturnValue({ token: "tok-frist", amount: 170, sessionId: "cs_1" });
    findRowByToken.mockResolvedValue(
      row({ paymentStatus: "paid", paymentReference: "cs_1", paidAt: "2026-08-20T00:00:00.000Z" }),
    );

    const res = await POST(makeRequest({}));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.alreadyProcessed).toBe(true);
    expect(updatePaymentStatus).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("adds a top-up payment to the running total instead of overwriting it, for a new session on an already-paid row", async () => {
    constructWebhookEvent.mockReturnValue(
      sessionEvent("checkout.session.completed", { payment_status: "paid" }),
    );
    extractPaymentDetails.mockReturnValue({ token: "tok-frist", amount: 50, sessionId: "cs_2" });
    findRowByToken.mockResolvedValue(
      row({ paymentStatus: "paid", paymentAmount: 100, paymentReference: "cs_1" }),
    );
    updatePaymentStatus.mockResolvedValue(undefined);

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(200);
    expect(updatePaymentStatus).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ paymentStatus: "paid", paymentAmount: 150, paymentReference: "cs_2" }),
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("returns 404 for a webhook whose token doesn't match any row", async () => {
    constructWebhookEvent.mockReturnValue(
      sessionEvent("checkout.session.completed", { payment_status: "paid" }),
    );
    extractPaymentDetails.mockReturnValue({ token: "unknown-token", amount: 170, sessionId: "cs_1" });
    findRowByToken.mockResolvedValue(null);

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(404);
    expect(updatePaymentStatus).not.toHaveBeenCalled();
  });

  it("returns 400 for a paid session with no client_reference_id", async () => {
    constructWebhookEvent.mockReturnValue(
      sessionEvent("checkout.session.completed", { payment_status: "paid" }),
    );
    extractPaymentDetails.mockReturnValue({ token: null, amount: 170, sessionId: "cs_1" });

    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    expect(findRowByToken).not.toHaveBeenCalled();
  });
});
