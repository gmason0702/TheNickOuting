import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InviteRow } from "@/lib/types";

process.env.RESEND_API_KEY = "re_fake";
process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_fake";
process.env.SITE_URL = "https://thenickouting.com";
process.env.PER_GOLFER_FEE = "50";
process.env.PER_RECEPTION_FEE = "20";

const findRowByToken = vi.fn();
const updateRsvpCounts = vi.fn();
const getTotalGolferCount = vi.fn();
vi.mock("@/lib/sheets", () => ({ findRowByToken, updateRsvpCounts, getTotalGolferCount }));

const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({ sendEmail }));

const createCheckoutSession = vi.fn();
vi.mock("@/lib/stripe", () => ({ createCheckoutSession }));

const { submitRsvp } = await import("./actions");

function row(overrides: Partial<InviteRow> = {}): InviteRow {
  return {
    rowNumber: 7,
    name: "The Atterson Family",
    email: "attersons@example.com",
    golfInviteTier: 1,
    golfRsvpCount: null,
    receptionAdultCount: null,
    receptionChildCount: null,
    rsvpToken: "tok-abc",
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

beforeEach(() => {
  findRowByToken.mockReset();
  updateRsvpCounts.mockReset();
  getTotalGolferCount.mockReset();
  getTotalGolferCount.mockResolvedValue(0);
  sendEmail.mockReset();
  createCheckoutSession.mockReset();
  delete process.env.STRIPE_ENABLED;
});

describe("submitRsvp", () => {
  it("returns not-found for an unknown token and writes nothing", async () => {
    findRowByToken.mockResolvedValue(null);

    const result = await submitRsvp("bad-token", 0, 0, 0);

    expect(result).toEqual({ status: "not-found" });
    expect(updateRsvpCounts).not.toHaveBeenCalled();
  });

  it("rejects negative or non-integer headcounts before touching the sheet", async () => {
    await expect(submitRsvp("tok-abc", -1, 0, 0)).rejects.toThrow();
    await expect(submitRsvp("tok-abc", 1.5, 0, 0)).rejects.toThrow();
    await expect(submitRsvp("tok-abc", 0, 0, -1)).rejects.toThrow();
    expect(findRowByToken).not.toHaveBeenCalled();
  });

  it("rejects more than one golf ticket before touching the sheet", async () => {
    await expect(submitRsvp("tok-abc", 2, 0, 0)).rejects.toThrow(
      "Only one golf ticket is allowed per email.",
    );
    expect(findRowByToken).not.toHaveBeenCalled();
  });

  describe("golf capacity", () => {
    it("rejects a new golfer once the field is at max capacity, without writing counts", async () => {
      findRowByToken.mockResolvedValue(row({ golfRsvpCount: 0 }));
      getTotalGolferCount.mockResolvedValue(50);

      await expect(submitRsvp("tok-abc", 1, 0, 0)).rejects.toThrow(
        "Golf is at maximum capacity — you can still RSVP for the reception.",
      );
      expect(updateRsvpCounts).not.toHaveBeenCalled();
    });

    it("allows a new golfer when under capacity", async () => {
      findRowByToken.mockResolvedValue(row({ golfRsvpCount: 0 }));
      getTotalGolferCount.mockResolvedValue(49);
      createCheckoutSession.mockResolvedValue({
        sessionId: "cs_4",
        checkoutUrl: "https://checkout.stripe.com/cs_4",
      });

      const result = await submitRsvp("tok-abc", 1, 0, 0);

      expect(updateRsvpCounts).toHaveBeenCalledWith(7, 1, 0, 0);
      expect(result).toMatchObject({ status: "redirect" });
    });

    it("lets someone already golfing resubmit even if the field has since filled up", async () => {
      findRowByToken.mockResolvedValue(row({ golfRsvpCount: 1, receptionAdultCount: 1 }));
      getTotalGolferCount.mockResolvedValue(50);
      createCheckoutSession.mockResolvedValue({
        sessionId: "cs_5",
        checkoutUrl: "https://checkout.stripe.com/cs_5",
      });

      const result = await submitRsvp("tok-abc", 1, 2, 0);

      expect(updateRsvpCounts).toHaveBeenCalledWith(7, 1, 2, 0);
      expect(result).toMatchObject({ status: "redirect" });
    });

    it("doesn't check capacity at all when golferCount is 0", async () => {
      findRowByToken.mockResolvedValue(row());

      await submitRsvp("tok-abc", 0, 0, 0);

      expect(getTotalGolferCount).not.toHaveBeenCalled();
    });
  });

  it("writes counts, sends the free confirmation, and skips Stripe for the true decline (0 golfers, 0 reception)", async () => {
    findRowByToken.mockResolvedValue(row());

    const result = await submitRsvp("tok-abc", 0, 0, 0);

    expect(updateRsvpCounts).toHaveBeenCalledWith(7, 0, 0, 0);
    expect(createCheckoutSession).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]?.[0]).toBe("attersons@example.com");
    expect(result).toEqual({
      status: "confirmed",
      golferCount: 0,
      receptionAdultCount: 0,
      receptionChildCount: 0,
      refundNote: false,
    });
  });

  it("a decline with children only (0 golfers, 0 adults, some kids) is still free, not a true decline", async () => {
    findRowByToken.mockResolvedValue(row());

    const result = await submitRsvp("tok-abc", 0, 0, 2);

    expect(updateRsvpCounts).toHaveBeenCalledWith(7, 0, 0, 2);
    expect(createCheckoutSession).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "confirmed",
      golferCount: 0,
      receptionAdultCount: 0,
      receptionChildCount: 2,
      refundNote: false,
    });
  });

  it.each([
    [0, 3, 60], // reception-only bills every adult seat at the standalone fee
    [1, 1, 50], // the golfer's bundled reception seat makes this free, total is just the golfer fee
    [1, 2, 70], // one reception seat is bundled free, the second is billed
    [1, 4, 110], // golfer fee plus three billed reception seats beyond the bundled one
  ])(
    "creates a Stripe checkout session for the correct bundled total (golferCount=%i, receptionAdultCount=%i -> $%i) and sends no confirmation email yet",
    async (golferCount, receptionAdultCount, expectedAmount) => {
      findRowByToken.mockResolvedValue(row());
      createCheckoutSession.mockResolvedValue({
        sessionId: "cs_1",
        checkoutUrl: "https://checkout.stripe.com/cs_1",
      });

      const result = await submitRsvp("tok-abc", golferCount, receptionAdultCount, 0);

      expect(updateRsvpCounts).toHaveBeenCalledWith(7, golferCount, receptionAdultCount, 0);
      expect(createCheckoutSession).toHaveBeenCalledWith({
        token: "tok-abc",
        amount: expectedAmount,
        customerEmail: "attersons@example.com",
        returnUrl: "https://thenickouting.com/rsvp/tok-abc/confirmed",
        cancelUrl: "https://thenickouting.com/rsvp/tok-abc",
      });
      expect(sendEmail).not.toHaveBeenCalled();
      expect(result).toEqual({ status: "redirect", checkoutUrl: "https://checkout.stripe.com/cs_1" });
    },
  );

  it("adding any number of children never changes the amount charged", async () => {
    findRowByToken.mockResolvedValue(row());
    createCheckoutSession.mockResolvedValue({
      sessionId: "cs_1",
      checkoutUrl: "https://checkout.stripe.com/cs_1",
    });

    const result = await submitRsvp("tok-abc", 1, 2, 6);

    expect(updateRsvpCounts).toHaveBeenCalledWith(7, 1, 2, 6);
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 70 }), // same as 1 golfer + 2 adults with 0 children
    );
    expect(result).toEqual({ status: "redirect", checkoutUrl: "https://checkout.stripe.com/cs_1" });
  });

  it("re-creates a fresh Stripe checkout session on resubmission after an abandoned checkout, using currently saved counts as the base", async () => {
    findRowByToken.mockResolvedValue(row({ golfRsvpCount: 1, receptionAdultCount: 4 }));
    createCheckoutSession.mockResolvedValue({
      sessionId: "cs_2",
      checkoutUrl: "https://checkout.stripe.com/cs_2",
    });

    const result = await submitRsvp("tok-abc", 1, 4, 0);

    expect(createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: "redirect", checkoutUrl: "https://checkout.stripe.com/cs_2" });
  });

  it("softly fails past Stripe when STRIPE_ENABLED=false, writing counts and sending a payment-pending email for the full amount owed", async () => {
    process.env.STRIPE_ENABLED = "false";
    findRowByToken.mockResolvedValue(row());

    const result = await submitRsvp("tok-abc", 1, 4, 0);

    expect(updateRsvpCounts).toHaveBeenCalledWith(7, 1, 4, 0);
    expect(createCheckoutSession).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0]?.[0]).toBe("attersons@example.com");
    expect(result).toEqual({
      status: "confirmed-payment-pending",
      golferCount: 1,
      receptionAdultCount: 4,
      receptionChildCount: 0,
      amountDue: 110,
    });
  });

  it("STRIPE_ENABLED=false does not affect the true decline (0/0), which is already free", async () => {
    process.env.STRIPE_ENABLED = "false";
    findRowByToken.mockResolvedValue(row());

    const result = await submitRsvp("tok-abc", 0, 0, 0);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: "confirmed",
      golferCount: 0,
      receptionAdultCount: 0,
      receptionChildCount: 0,
      refundNote: false,
    });
  });

  describe("resubmitting after already paying (no refunds; only net increases are charged)", () => {
    it("allows decreasing below what was already paid, writes the lower counts, and flags a refund note instead of charging anything", async () => {
      // Already paid $110 for 1 golfer + 4 reception; now dropping to 1 golfer + 0 reception ($50 owed).
      findRowByToken.mockResolvedValue(
        row({ paymentStatus: "paid", paymentAmount: 110, golfRsvpCount: 1, receptionAdultCount: 4 }),
      );

      const result = await submitRsvp("tok-abc", 1, 0, 0);

      expect(updateRsvpCounts).toHaveBeenCalledWith(7, 1, 0, 0);
      expect(createCheckoutSession).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: "confirmed",
        golferCount: 1,
        receptionAdultCount: 0,
        receptionChildCount: 0,
        refundNote: true,
      });
    });

    it("charges only the incremental difference when increasing reception count after already paying, not the full new total", async () => {
      // Already paid $70 for 1 golfer + 2 reception; now bumping reception to 4 ($110 total) -- should owe just $40 more.
      findRowByToken.mockResolvedValue(
        row({ paymentStatus: "paid", paymentAmount: 70, golfRsvpCount: 1, receptionAdultCount: 2 }),
      );
      createCheckoutSession.mockResolvedValue({
        sessionId: "cs_3",
        checkoutUrl: "https://checkout.stripe.com/cs_3",
      });

      const result = await submitRsvp("tok-abc", 1, 4, 0);

      expect(createCheckoutSession).toHaveBeenCalledWith({
        token: "tok-abc",
        amount: 40,
        customerEmail: "attersons@example.com",
        returnUrl: "https://thenickouting.com/rsvp/tok-abc/confirmed",
        cancelUrl: "https://thenickouting.com/rsvp/tok-abc",
      });
      expect(result).toEqual({ status: "redirect", checkoutUrl: "https://checkout.stripe.com/cs_3" });
    });

    it("resubmitting the exact same counts after paying owes nothing further and carries no refund note", async () => {
      findRowByToken.mockResolvedValue(row({ paymentStatus: "paid", paymentAmount: 50, golfRsvpCount: 1 }));

      const result = await submitRsvp("tok-abc", 1, 0, 0);

      expect(createCheckoutSession).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: "confirmed",
        golferCount: 1,
        receptionAdultCount: 0,
        receptionChildCount: 0,
        refundNote: false,
      });
    });

    it("STRIPE_ENABLED=false still charges only the incremental difference for an already-paid row", async () => {
      process.env.STRIPE_ENABLED = "false";
      findRowByToken.mockResolvedValue(
        row({ paymentStatus: "paid", paymentAmount: 70, golfRsvpCount: 1, receptionAdultCount: 2 }),
      );

      const result = await submitRsvp("tok-abc", 1, 4, 0);

      expect(createCheckoutSession).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: "confirmed-payment-pending",
        golferCount: 1,
        receptionAdultCount: 4,
        receptionChildCount: 0,
        amountDue: 40,
      });
    });

    it("increasing only the child count after already paying owes nothing further", async () => {
      findRowByToken.mockResolvedValue(
        row({ paymentStatus: "paid", paymentAmount: 50, golfRsvpCount: 1, receptionAdultCount: 1 }),
      );

      const result = await submitRsvp("tok-abc", 1, 1, 3);

      expect(updateRsvpCounts).toHaveBeenCalledWith(7, 1, 1, 3);
      expect(createCheckoutSession).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: "confirmed",
        golferCount: 1,
        receptionAdultCount: 1,
        receptionChildCount: 3,
        refundNote: false,
      });
    });
  });
});
