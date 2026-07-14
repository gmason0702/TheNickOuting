Status: open
Labels: wayfinder:grilling
Assignee: (unclaimed)
Blocked-by: 01-tech-stack-hosting.md

# Design email sending provider & reminder scheduling mechanism

## Question

Which transactional email provider sends the app-owned invite/reminder/confirmation emails at near-zero cost for this volume (roughly a few hundred invitees times a handful of sends each), and what scheduling mechanism on the chosen host (ticket 01) triggers the escalating reminder cadence — initial send 2026-08-01, next 2026-08-15, then +2 weeks, then every 4-5 days — stopping per-person once they RSVP or once the event (2026-10-02) passes?
