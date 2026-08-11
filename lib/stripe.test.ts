import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_fake";

const sessionsCreate = vi.fn();
const constructEvent = vi.fn();

vi.mock("stripe", () => ({
	default: vi.fn(() => ({
		checkout: { sessions: { create: sessionsCreate } },
		webhooks: { constructEvent },
	})),
}));

const { createCheckoutSession, constructWebhookEvent, extractPaymentDetails } = await import("./stripe");

beforeEach(() => {
	sessionsCreate.mockReset();
	constructEvent.mockReset();
});

describe("createCheckoutSession", () => {
	it("creates a session for the given amount and returns the checkout url", async () => {
		sessionsCreate.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/cs_1" });

		const result = await createCheckoutSession({
			token: "tok-abc",
			amount: 70,
			customerEmail: "attersons@example.com",
			returnUrl: "https://site/rsvp/tok-abc/confirmed",
			cancelUrl: "https://site/rsvp/tok-abc",
		});

		expect(result).toEqual({ sessionId: "cs_1", checkoutUrl: "https://checkout.stripe.com/cs_1" });

		const call = sessionsCreate.mock.calls[0]![0];
		expect(call.mode).toBe("payment");
		expect(call.client_reference_id).toBe("tok-abc");
		expect(call.customer_email).toBe("attersons@example.com");
		expect(call.line_items[0].price_data.unit_amount).toBe(7000);
		expect(call.success_url).toBe("https://site/rsvp/tok-abc/confirmed");
		expect(call.cancel_url).toBe("https://site/rsvp/tok-abc");
	});

	it("throws if Stripe does not return a checkout url", async () => {
		sessionsCreate.mockResolvedValue({ id: "cs_1", url: null });

		await expect(
			createCheckoutSession({
				token: "tok-abc",
				amount: 50,
				customerEmail: "a@example.com",
				returnUrl: "https://site/return",
				cancelUrl: "https://site/cancel",
			}),
		).rejects.toThrow("Stripe checkout session response missing url");
	});
});

describe("constructWebhookEvent", () => {
	it("delegates to the SDK's webhook verification", () => {
		constructEvent.mockReturnValue({ type: "checkout.session.completed" });

		const event = constructWebhookEvent("raw-body", "sig-header");

		expect(constructEvent).toHaveBeenCalledWith("raw-body", "sig-header", "whsec_fake");
		expect(event).toEqual({ type: "checkout.session.completed" });
	});

	it("propagates a thrown signature verification error", () => {
		constructEvent.mockImplementation(() => {
			throw new Error("No signatures found matching the expected signature for payload");
		});

		expect(() => constructWebhookEvent("raw-body", "bad-sig")).toThrow(
			"No signatures found matching the expected signature for payload",
		);
	});
});

describe("extractPaymentDetails", () => {
	it("maps amount_total (cents) to dollars, client_reference_id to token, and id to sessionId", () => {
		const details = extractPaymentDetails({
			id: "cs_1",
			client_reference_id: "tok-abc",
			amount_total: 7000,
		} as any);

		expect(details).toEqual({ token: "tok-abc", amount: 70, sessionId: "cs_1" });
	});

	it("defaults amount to 0 when amount_total is missing", () => {
		const details = extractPaymentDetails({
			id: "cs_1",
			client_reference_id: "tok-abc",
			amount_total: null,
		} as any);

		expect(details.amount).toBe(0);
	});
});
