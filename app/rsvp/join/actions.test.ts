import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.RESEND_API_KEY = "re_fake";
process.env.PAYPAL_CLIENT_ID = "id";
process.env.PAYPAL_CLIENT_SECRET = "secret";
process.env.PAYPAL_WEBHOOK_ID = "wh";
process.env.PAYPAL_PAYEE_EMAIL = "payee@example.com";
process.env.SITE_URL = "https://thenickouting.com";
process.env.PER_GOLFER_FEE = "50";
process.env.PER_RECEPTION_FEE = "20";

const generateUniqueToken = vi.fn();
const appendRow = vi.fn();
const updateRsvpCounts = vi.fn();
const getTotalGolferCount = vi.fn();
vi.mock("@/lib/sheets", () => ({
  generateUniqueToken,
  appendRow,
  updateRsvpCounts,
  getTotalGolferCount,
}));

const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({ sendEmail }));

const createOrder = vi.fn();
vi.mock("@/lib/paypal", () => ({ createOrder }));

const { submitJoin } = await import("./actions");

beforeEach(() => {
  generateUniqueToken.mockReset();
  generateUniqueToken.mockResolvedValue("fresh-token");
  appendRow.mockReset();
  appendRow.mockResolvedValue(52);
  updateRsvpCounts.mockReset();
  getTotalGolferCount.mockReset();
  getTotalGolferCount.mockResolvedValue(0);
  sendEmail.mockReset();
  createOrder.mockReset();
  delete process.env.PAYPAL_ENABLED;
  delete process.env.WALKIN_ENABLED;
});

describe("submitJoin", () => {
  it("returns closed and writes nothing when WALKIN_ENABLED is not set", async () => {
    const result = await submitJoin("Jane Golfer", "jane@example.com", 0, 0);

    expect(result).toEqual({ status: "closed" });
    expect(appendRow).not.toHaveBeenCalled();
  });

  describe("with WALKIN_ENABLED=true", () => {
    beforeEach(() => {
      process.env.WALKIN_ENABLED = "true";
    });

    it("rejects a blank name before touching the sheet", async () => {
      await expect(submitJoin("   ", "jane@example.com", 0, 0)).rejects.toThrow(
        "Name is required.",
      );
      expect(appendRow).not.toHaveBeenCalled();
    });

    it("rejects an invalid email before touching the sheet", async () => {
      await expect(submitJoin("Jane Golfer", "not-an-email", 0, 0)).rejects.toThrow(
        "Enter a valid email address.",
      );
      expect(appendRow).not.toHaveBeenCalled();
    });

    it("rejects negative or non-integer headcounts before touching the sheet", async () => {
      await expect(submitJoin("Jane Golfer", "jane@example.com", -1, 0)).rejects.toThrow();
      await expect(submitJoin("Jane Golfer", "jane@example.com", 1.5, 0)).rejects.toThrow();
      expect(appendRow).not.toHaveBeenCalled();
    });

    it("rejects more than one golf ticket before touching the sheet", async () => {
      await expect(submitJoin("Jane Golfer", "jane@example.com", 2, 0)).rejects.toThrow(
        "Only one golf ticket is allowed per email.",
      );
      expect(appendRow).not.toHaveBeenCalled();
    });

    describe("golf capacity", () => {
      it("rejects a new golfer once the field is at max capacity, without writing anything", async () => {
        getTotalGolferCount.mockResolvedValue(50);

        await expect(submitJoin("Jane Golfer", "jane@example.com", 1, 0)).rejects.toThrow(
          "Golf is at maximum capacity — you can still RSVP for the reception.",
        );
        expect(appendRow).not.toHaveBeenCalled();
      });

      it("doesn't check capacity at all when golferCount is 0", async () => {
        await submitJoin("Jane Golfer", "jane@example.com", 0, 0);
        expect(getTotalGolferCount).not.toHaveBeenCalled();
      });
    });

    it("appends a new row, writes headcounts, and sends the free confirmation for a true decline (0/0)", async () => {
      const result = await submitJoin("Jane Golfer", "jane@example.com", 0, 0);

      expect(generateUniqueToken).toHaveBeenCalledTimes(1);
      expect(appendRow).toHaveBeenCalledWith({
        name: "Jane Golfer",
        email: "jane@example.com",
        rsvpToken: "fresh-token",
      });
      expect(updateRsvpCounts).toHaveBeenCalledWith(52, 0, 0);
      expect(createOrder).not.toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail.mock.calls[0]?.[0]).toBe("jane@example.com");
      expect(result).toEqual({
        status: "confirmed",
        golferCount: 0,
        receptionCount: 0,
        rsvpLink: "https://thenickouting.com/rsvp/fresh-token",
      });
    });

    it("trims the submitted name before writing it and using it in the confirmation email", async () => {
      await submitJoin("  Jane Golfer  ", "jane@example.com", 0, 0);
      expect(appendRow).toHaveBeenCalledWith(expect.objectContaining({ name: "Jane Golfer" }));
    });

    it("creates a PayPal order for the bundled total when a golfer is added, using the fresh token", async () => {
      createOrder.mockResolvedValue({
        orderId: "ORDER1",
        approveUrl: "https://paypal/approve/ORDER1",
      });

      const result = await submitJoin("Jane Golfer", "jane@example.com", 1, 2);

      expect(updateRsvpCounts).toHaveBeenCalledWith(52, 1, 2);
      expect(createOrder).toHaveBeenCalledWith({
        token: "fresh-token",
        amount: 70, // 1 golfer ($50, bundles 1 reception seat) + 1 billed reception seat ($20)
        returnUrl: "https://thenickouting.com/rsvp/fresh-token/confirmed",
        cancelUrl: "https://thenickouting.com/rsvp/fresh-token",
      });
      expect(sendEmail).not.toHaveBeenCalled();
      expect(result).toEqual({ status: "redirect", approveUrl: "https://paypal/approve/ORDER1" });
    });

    it("softly fails past PayPal when PAYPAL_ENABLED=false, sending a payment-pending email for the full amount owed", async () => {
      process.env.PAYPAL_ENABLED = "false";

      const result = await submitJoin("Jane Golfer", "jane@example.com", 1, 4);

      expect(updateRsvpCounts).toHaveBeenCalledWith(52, 1, 4);
      expect(createOrder).not.toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail.mock.calls[0]?.[0]).toBe("jane@example.com");
      expect(result).toEqual({
        status: "confirmed-payment-pending",
        golferCount: 1,
        receptionCount: 4,
        amountDue: 110,
        rsvpLink: "https://thenickouting.com/rsvp/fresh-token",
      });
    });
  });
});
