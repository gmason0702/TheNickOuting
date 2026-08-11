# The Nick Jacobi Memorial Golf Tournament — RSVP + Payment Site

Next.js (TypeScript) app implementing the vertical slices in `../tickets.md`
(spec: `.scratch/golf-tournament-rsvp-site/SPEC.md`). RSVP + payment state lives in a
Google Sheet; Stripe Checkout handles payment; Resend sends invite/reminder/confirmation
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
| `STRIPE_SECRET_KEY` | Stripe secret API key — `sk_test_...` in test mode, `sk_live_...` in live; the key itself determines mode, there's no separate mode env var |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the webhook endpoint registered in the Stripe Dashboard (or printed by `stripe listen` for local dev) |
| `PER_GOLFER_FEE` | Flat per-golfer fee in USD, includes one bundled reception seat (defaults to `75`) |
| `PER_RECEPTION_FEE` | Per-person reception fee in USD, only billed for reception headcount beyond the number of golfers (defaults to `30`) |
| `RESEND_API_KEY` | Resend API key |
| `EMAIL_FROM` | From-header (defaults to the tournament's `mail.thenickouting.com` address) |
| `SITE_URL` | Public site origin, used to build RSVP links |
| `CRON_SECRET` | Optional bearer token the cron route requires when set |
| `AUTOMATED_SENDING_ENABLED` | Must be the literal string `true` or the daily cron is a no-op. **Defaults to disabled** — leave unset until Stripe, Resend, and everything else is verified end-to-end, since once enabled it will email every eligible real invitee in the Sheet automatically. |
| `STRIPE_ENABLED` | Set to the literal string `false` to softly bypass Stripe while it isn't set up yet — any RSVP that owes money still writes its headcounts and gets an immediate "payment coming soon" email instead of a Stripe Checkout redirect/error. Also gates the daily cron's payment-request email (see below) — nothing owed gets asked for until this is `true`. **Defaults to enabled** (normal behavior); flip back once real Stripe credentials are in place. |

## Manual steps outside this codebase

These require live account access an agent doesn't have, and aren't done yet:

1. **Vercel:** create the project, connect this repo, set the env vars above, and
   connect the `thenickouting.com` domain (with `mail.thenickouting.com` for Resend).
2. **Stripe:** create/use a Stripe account and grab the test-mode secret key
   (`sk_test_...`) for `STRIPE_SECRET_KEY`. In the Stripe Dashboard, register a
   webhook endpoint at `/api/webhooks/stripe` subscribed to
   `checkout.session.completed` and `checkout.session.async_payment_succeeded`, and
   note its signing secret for `STRIPE_WEBHOOK_SECRET`. Test mode and live mode each
   have their own endpoint + signing secret — set up both, with matching env vars per
   Vercel environment (Preview vs Production). Switch to the live secret key only once
   ready to accept real charges.
3. **Resend:** verify the `mail.thenickouting.com` sending domain via DNS.
4. **Vercel Cron:** confirm the `vercel.json` cron entry is picked up after first
   deploy (Vercel Hobby plans allow one daily invocation).
5. **Google Sheet:** add a new column Q named `payment_request_sent_at` — tracks the
   one-time "secure your tickets" payment email (separate from `invite_sent_at`, column N).
   Fires automatically for anyone who's RSVP'd with a balance due, the first daily cron
   run after `STRIPE_ENABLED` is `true`.
