import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InviteRow } from "@/lib/types";

process.env.RESEND_API_KEY = "re_fake";
process.env.PAYPAL_CLIENT_ID = "id";
process.env.PAYPAL_CLIENT_SECRET = "secret";
process.env.PAYPAL_WEBHOOK_ID = "wh";
process.env.PAYPAL_PAYEE_EMAIL = "payee@example.com";
process.env.SITE_URL = "https://thenickouting.com";
process.env.PER_GOLFER_FEE = "50";
process.env.PER_RECEPTION_FEE = "20";

const findRowByToken = vi.fn();
const updateRsvpCounts = vi.fn();
vi.mock("@/lib/sheets", () => ({ findRowByToken, updateRsvpCounts }));

const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({ sendEmail }));

const createOrder = vi.fn();
vi.mock("@/lib/paypal", () => ({ createOrder }));

const { submitRsvp } = await import("./actions");

function row(overrides: Partial<InviteRow> = {}): InviteRow {
  return {
    rowNumber: 7,
    name: "The Atterson Family",
    email: "attersons@example.com",
    golfInviteTier: 1,
    golfRsvpCount: null,
    receptionCount: null,
    rsvpToken: "tok-abc",
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

beforeEach(() => {
  findRowByToken.mockReset();
  updateRsvpCounts.mockReset();
  sendEmail.mockReset();
  createOrder.mockReset();
  delete process.env.PAYPAL_ENABLED;
});

describe("submitRsvp", () => {
  it("returns not-found for an unknown token and writes nothing", async () => {
    findRowByToken.mockResolvedValue(null);

    const result = await submitRsvp("bad-token", 0, 0);

    expect(result).toEqual({ status: "not-found" });
    expect(updateRsvpCounts).not.toHaveBeenCalled();
  });

  it("rejects negative or non-integer headcounts before touching the sheet", async () => {
    await expect(submitRsvp("tok-abc", -1, 0)).rejects.toThrow();
    await expect(submitRsvp("tok-abc", 1.5, 0)).rejects.toThrow();
    expect(findRowByToken).not.toHaveBeenCalled();
  });

  it("writes counts, sends the free confirmation, and skips PayPal for the true decline (0 golfers, 0 reception)", async () => {
    findRowByToken.mockResolvedValue(row());

    const result = await submitRsvp("tok-abc", 0, 0);

    expect(updateRsvpCounts).toHaveBeenCalledWith(7, 0, 0);
    expect(createOrder).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]?.[0]).toBe("attersons@example.com");
    expect(result).toEqual({
      status: "confirmed",
      golferCount: 0,
      receptionCount: 0,
      refundNote: false,
    });
  });

  it.each([
    [0, 3, 60], // reception-only bills every seat at the standalone fee
    [1, 1, 50], // the golfer's bundled reception seat makes this free, total is just the golfer fee
    [1, 2, 70], // one reception seat is bundled free, the second is billed
    [3, 0, 150], // golfer fee only, no reception attendees
  ])(
    "creates a PayPal order for the correct bundled total (golferCount=%i, receptionCount=%i -> $%i) and sends no confirmation email yet",
    async (golferCount, receptionCount, expectedAmount) => {
      findRowByToken.mockResolvedValue(row());
      createOrder.mockResolvedValue({ orderId: "ORDER1", approveUrl: "https://paypal/approve/ORDER1" });

      const result = await submitRsvp("tok-abc", golferCount, receptionCount);

      expect(updateRsvpCounts).toHaveBeenCalledWith(7, golferCount, receptionCount);
      expect(createOrder).toHaveBeenCalledWith({
        token: "tok-abc",
        amount: expectedAmount,
        returnUrl: "https://thenickouting.com/rsvp/tok-abc/confirmed",
        cancelUrl: "https://thenickouting.com/rsvp/tok-abc",
      });
      expect(sendEmail).not.toHaveBeenCalled();
      expect(result).toEqual({ status: "redirect", approveUrl: "https://paypal/approve/ORDER1" });
    },
  );

  it("re-creates a fresh PayPal order on resubmission after an abandoned checkout, using currently saved counts as the base", async () => {
    findRowByToken.mockResolvedValue(row({ golfRsvpCount: 2, receptionCount: 4 }));
    createOrder.mockResolvedValue({ orderId: "ORDER2", approveUrl: "https://paypal/approve/ORDER2" });

    const result = await submitRsvp("tok-abc", 2, 4);

    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: "redirect", approveUrl: "https://paypal/approve/ORDER2" });
  });

  it("softly fails past PayPal when PAYPAL_ENABLED=false, writing counts and sending a payment-pending email for the full amount owed", async () => {
    process.env.PAYPAL_ENABLED = "false";
    findRowByToken.mockResolvedValue(row());

    const result = await submitRsvp("tok-abc", 2, 4);

    expect(updateRsvpCounts).toHaveBeenCalledWith(7, 2, 4);
    expect(createOrder).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]?.[0]).toBe("attersons@example.com");
    expect(result).toEqual({
      status: "confirmed-payment-pending",
      golferCount: 2,
      receptionCount: 4,
      amountDue: 140,
    });
  });

  it("PAYPAL_ENABLED=false does not affect the true decline (0/0), which is already free", async () => {
    process.env.PAYPAL_ENABLED = "false";
    findRowByToken.mockResolvedValue(row());

    const result = await submitRsvp("tok-abc", 0, 0);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "confirmed",
      golferCount: 0,
      receptionCount: 0,
      refundNote: false,
    });
  });

  describe("resubmitting after already paying (no refunds; only net increases are charged)", () => {
    it("allows decreasing below what was already paid, writes the lower counts, and flags a refund note instead of charging anything", async () => {
      // Already paid $150 for 3 golfers; now dropping to 1 golfer + 0 reception ($50 owed).
      findRowByToken.mockResolvedValue(row({ paymentStatus: "paid", paymentAmount: 150 }));

      const result = await submitRsvp("tok-abc", 1, 0);

      expect(updateRsvpCounts).toHaveBeenCalledWith(7, 1, 0);
      expect(createOrder).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: "confirmed",
        golferCount: 1,
        receptionCount: 0,
        refundNote: true,
      });
    });

    it("charges only the incremental difference when increasing after already paying, not the full new total", async () => {
      // Already paid $100 for 2 golfers; now bumping to 3 golfers ($150 total) -- should owe just $50 more.
      findRowByToken.mockResolvedValue(row({ paymentStatus: "paid", paymentAmount: 100 }));
      createOrder.mockResolvedValue({ orderId: "ORDER3", approveUrl: "https://paypal/approve/ORDER3" });

      const result = await submitRsvp("tok-abc", 3, 0);

      expect(createOrder).toHaveBeenCalledWith({
        token: "tok-abc",
        amount: 50,
        returnUrl: "https://thenickouting.com/rsvp/tok-abc/confirmed",
        cancelUrl: "https://thenickouting.com/rsvp/tok-abc",
      });
      expect(result).toEqual({ status: "redirect", approveUrl: "https://paypal/approve/ORDER3" });
    });

    it("resubmitting the exact same counts after paying owes nothing further and carries no refund note", async () => {
      findRowByToken.mockResolvedValue(row({ paymentStatus: "paid", paymentAmount: 100 }));

      const result = await submitRsvp("tok-abc", 2, 0);

      expect(createOrder).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: "confirmed",
        golferCount: 2,
        receptionCount: 0,
        refundNote: false,
      });
    });

    it("PAYPAL_ENABLED=false still charges only the incremental difference for an already-paid row", async () => {
      process.env.PAYPAL_ENABLED = "false";
      findRowByToken.mockResolvedValue(row({ paymentStatus: "paid", paymentAmount: 100 }));

      const result = await submitRsvp("tok-abc", 3, 0);

      expect(createOrder).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: "confirmed-payment-pending",
        golferCount: 3,
        receptionCount: 0,
        amountDue: 50,
      });
    });
  });
});
