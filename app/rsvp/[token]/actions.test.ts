import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InviteRow } from "@/lib/types";

process.env.RESEND_API_KEY = "re_fake";
process.env.PAYPAL_CLIENT_ID = "id";
process.env.PAYPAL_CLIENT_SECRET = "secret";
process.env.PAYPAL_WEBHOOK_ID = "wh";
process.env.PAYPAL_PAYEE_EMAIL = "payee@example.com";
process.env.SITE_URL = "https://thenickouting.com";
process.env.PER_GOLFER_FEE = "85";

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

  it.each([
    [0, 0],
    [0, 3],
  ])(
    "writes counts, sends the free confirmation, and skips PayPal for golferCount=%i receptionCount=%i",
    async (golferCount, receptionCount) => {
      findRowByToken.mockResolvedValue(row());

      const result = await submitRsvp("tok-abc", golferCount, receptionCount);

      expect(updateRsvpCounts).toHaveBeenCalledWith(7, golferCount, receptionCount);
      expect(createOrder).not.toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail.mock.calls[0]?.[0]).toBe("attersons@example.com");
      expect(result).toEqual({ status: "confirmed", golferCount, receptionCount });
    },
  );

  it.each([
    [2, 4],
    [3, 0],
  ])(
    "creates a PayPal order and returns a redirect for golferCount=%i receptionCount=%i, sending no confirmation email yet",
    async (golferCount, receptionCount) => {
      findRowByToken.mockResolvedValue(row());
      createOrder.mockResolvedValue({ orderId: "ORDER1", approveUrl: "https://paypal/approve/ORDER1" });

      const result = await submitRsvp("tok-abc", golferCount, receptionCount);

      expect(updateRsvpCounts).toHaveBeenCalledWith(7, golferCount, receptionCount);
      expect(createOrder).toHaveBeenCalledWith({
        token: "tok-abc",
        golferCount,
        feePerGolfer: 85,
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
});
