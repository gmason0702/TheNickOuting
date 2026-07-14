Labels: wayfinder:map
Status: open

# Golf Tournament RSVP + Payment Site — Map

## Destination

A working, deployed, custom-coded website (built from scratch — no existing domain/hosting) that runs RSVP + payment for a golf tournament on **2026-10-02**, architected to be reused for future years. Recipients (a few hundred, one person per invite) get a personalized link via an app-sent email. They can RSVP to the golf tournament, the reception, or both — golf is a paid flat fee by credit card, the reception is free. RSVP and payment status write back to a real Google Sheet the organizer can browse/edit directly, which also serves as the invitee list. The app automatically sends the initial invite (target **2026-08-01**) and escalating reminders to anyone who hasn't RSVP'd (**2026-08-15**, then +2 weeks, then every 4-5 days) until they RSVP or the event passes, plus confirmation emails after RSVP and after payment. Fixed costs must stay near zero — pay only per-transaction processor fees.

## Notes

- Domain: small personal event-registration + payments site, single organizer (Gordon), reused annually.
- Standing constraints:
  - Near-zero fixed/monthly cost — transaction fees only.
  - Custom code, not no-code/low-code (confirmed over Google Forms + Zapier style assembly).
  - Starting from scratch: no existing domain, hosting account, or GitHub repo yet.
  - v1 is single-person-per-invite (no group/guest RSVPs).
  - Flat fee per player for v1, but keep the pricing/data model normalized so variable pricing (tiers, add-ons) can be layered in later without a rearchitecture.
  - Refunds/cancellations are out of scope — handled manually if they ever come up.
  - The Google Sheet must remain a real, human-browsable/editable spreadsheet (not just an internal DB) — this is the system of record the organizer checks.
- Key dates: initial invite send target 2026-08-01; event 2026-10-02; reminder cadence 2026-08-15 (2wk after initial), then +2wk (~2026-08-29), then every 4-5 days until RSVP or the event.
- Skills every session should consult: `/grilling` and `/domain-modeling` by default; `/prototype` for Prototype-type tickets.
- The invitee list doesn't exist yet in usable form — Gordon has "the start of a list" but not in hand. Ticket 10 (import) is blocked on him supplying it; that real-world dependency isn't itself a ticket.

## Decisions so far

(none yet — tickets not yet resolved)

## Not yet specified

- What exactly needs to be parameterized (event date, price, Sheet ID, sender identity, etc.) to make this cleanly cloneable for next year's tournament — will sharpen once the core build tickets resolve.
- How checkout failures (declined card, abandoned Stripe Checkout session) are surfaced back to the invitee and reflected in the Sheet — will sharpen once payment processor (ticket 2) and the RSVP/payment page prototype (ticket 8) resolve.
- Domain name / branding / from-address for outgoing email — will sharpen once tech stack & hosting (ticket 1) and email sending (ticket 6) resolve.

## Out of scope

- Refunds/cancellations — explicitly ruled out for this build; handle manually via the payment processor's dashboard if needed.
- Group/guest RSVPs (one invite covering multiple people, e.g. a foursome) — v1 is single-person-per-invite; revisit as a future effort if needed, not a graduation of this map.
