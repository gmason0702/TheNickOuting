function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  get googleServiceAccountEmail() {
    return required("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  },
  get googleServiceAccountPrivateKey() {
    return Buffer.from(required("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_B64"), "base64").toString(
      "utf8",
    );
  },
  get googleSheetId() {
    return required("GOOGLE_SHEET_ID");
  },
  get googleSheetTabName() {
    return process.env.GOOGLE_SHEET_TAB_NAME || "Sheet1";
  },
  get paypalClientId() {
    return required("PAYPAL_CLIENT_ID");
  },
  get paypalClientSecret() {
    return required("PAYPAL_CLIENT_SECRET");
  },
  get paypalMode() {
    return process.env.PAYPAL_MODE === "live" ? "live" : "sandbox";
  },
  get paypalWebhookId() {
    return required("PAYPAL_WEBHOOK_ID");
  },
  get paypalPayeeEmail() {
    return required("PAYPAL_PAYEE_EMAIL");
  },
  get perGolferFee() {
    const raw = process.env.PER_GOLFER_FEE;
    return raw ? Number(raw) : 50;
  },
  get perReceptionFee() {
    const raw = process.env.PER_RECEPTION_FEE;
    return raw ? Number(raw) : 20;
  },
  get resendApiKey() {
    return required("RESEND_API_KEY");
  },
  get emailFrom() {
    return (
      process.env.EMAIL_FROM ||
      '"The Nick Jacobi Memorial Golf Tournament" <rsvp@mail.thenickouting.com>'
    );
  },
  get siteUrl() {
    return process.env.SITE_URL || "https://thenickouting.com";
  },
  get cronSecret() {
    return process.env.CRON_SECRET;
  },
  get automatedSendingEnabled() {
    return process.env.AUTOMATED_SENDING_ENABLED === "true";
  },
  /** Reversible toggle: set to the literal string "false" to soft-fail past PayPal while it's not set up yet. */
  get paypalEnabled() {
    return process.env.PAYPAL_ENABLED !== "false";
  },
};
