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
  get stripeSecretKey() {
    return required("STRIPE_SECRET_KEY");
  },
  get stripeWebhookSecret() {
    return required("STRIPE_WEBHOOK_SECRET");
  },
  get perGolferFee() {
    const raw = process.env.PER_GOLFER_FEE;
    return raw ? Number(raw) : 75;
  },
  get perReceptionFee() {
    const raw = process.env.PER_RECEPTION_FEE;
    return raw ? Number(raw) : 30;
  },
  get resendApiKey() {
    return required("RESEND_API_KEY");
  },
  get emailFrom() {
    return (
      process.env.EMAIL_FROM ||
      '"The Nick Jacobi Memorial Outing" <rsvp@mail.thenickouting.com>'
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
  /** Explicit opt-in: set to the literal string "true" to open up walk-in admission signups. */
  get walkinEnabled() {
    return process.env.WALKIN_ENABLED === "true";
  },
  /** Reversible toggle: set to the literal string "false" to soft-fail past Stripe while it's not set up yet. */
  get stripeEnabled() {
    return process.env.STRIPE_ENABLED !== "false";
  },
};
