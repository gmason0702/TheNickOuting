# The Nick Jacobi Memorial Golf Tournament — RSVP + Payment Site

Next.js (TypeScript) app implementing the vertical slices in `../tickets.md`
(spec: `.scratch/golf-tournament-rsvp-site/SPEC.md`). RSVP + payment state lives in a
Google Sheet; PayPal Checkout handles payment; Resend sends invite/reminder/confirmation
email; a daily Vercel Cron Job drives the invite and reminder passes.

## Local setup

```
npm install
npm run typecheck
npm test
npm run dev
```

## Required environment variables

| Variable | Purpose |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email with Editor access to the Sheet |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_B64` | Service account private key, base64-encoded (avoids newline-mangling in env var UIs) |
| `GOOGLE_SHEET_ID` | Spreadsheet ID of `Invites List - golf_invite_list` |
| `GOOGLE_SHEET_TAB_NAME` | Sheet tab name (defaults to `Sheet1`) |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | PayPal REST app credentials |
| `PAYPAL_MODE` | `sandbox` (default) or `live` |
| `PAYPAL_WEBHOOK_ID` | ID of the webhook registered for this app |
| `PAYPAL_PAYEE_EMAIL` | PayPal email of the actual fee recipient |
| `PER_GOLFER_FEE` | Flat per-golfer fee in USD, includes one bundled reception seat (defaults to `75`) |
| `PER_RECEPTION_FEE` | Per-person reception fee in USD, only billed for reception headcount beyond the number of golfers (defaults to `30`) |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | From-header (defaults to the tournament's `mail.thenickouting.com` address) |
| `SITE_URL` | Public site origin, used to build RSVP links |
| `CRON_SECRET` | Optional bearer token the cron route requires when set |
| `AUTOMATED_SENDING_ENABLED` | Must be the literal string `true` or the daily cron is a no-op. **Defaults to disabled** — leave unset until PayPal, Resend, and everything else is verified end-to-end, since once enabled it will email every eligible real invitee in the Sheet automatically. |
| `PAYPAL_ENABLED` | Set to the literal string `false` to softly bypass PayPal while it isn't set up yet — any RSVP that owes money still writes its headcounts and gets an immediate "payment coming soon" email instead of a PayPal redirect/error. Also gates the daily cron's payment-request email (see below) — nothing owed gets asked for until this is `true`. **Defaults to enabled** (normal behavior); flip back once real PayPal credentials are in place. |

## Manual steps outside this codebase

These require live account access an agent doesn't have, and aren't done yet:

1. **Vercel:** create the project, connect this repo, set the env vars above, and
   connect the `thenickouting.com` domain (with `mail.thenickouting.com` for Resend).
2. **PayPal:** create the Sandbox REST app, register a webhook for
   `CHECKOUT.ORDER.APPROVED` / `PAYMENT.CAPTURE.COMPLETED` pointed at
   `/api/webhooks/paypal`, and note the webhook ID. Switch to Live credentials only
   once the payee's Live PayPal email/credentials exist (see the spec's Further Notes).
3. **Resend:** verify the `mail.thenickouting.com` sending domain via DNS.
4. **Vercel Cron:** confirm the `vercel.json` cron entry is picked up after first
   deploy (Vercel Hobby plans allow one daily invocation).
5. **Google Sheet:** add a new column Q named `payment_request_sent_at` — tracks the
   one-time "secure your tickets" payment email (separate from `invite_sent_at`, column N).
   Fires automatically for anyone who's RSVP'd with a balance due, the first daily cron
   run after `PAYPAL_ENABLED` is `true`.
