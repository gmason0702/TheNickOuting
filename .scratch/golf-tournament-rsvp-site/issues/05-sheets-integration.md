Status: open
Labels: wayfinder:research
Assignee: (unclaimed)
Blocked-by: 01-tech-stack-hosting.md, 03-data-model.md

# Design Google Sheets integration approach

## Question

How does the app read/write the Google Sheet (the schema from ticket 03) in a way that's reliable, near-zero-cost, and works from the chosen host/stack (ticket 01) — e.g. Google Sheets API with a service account vs. an Apps Script web-app endpoint vs. some other bridge? Cover auth setup, rate limits at this scale (a few hundred rows, low write frequency), and how concurrent writes (e.g. a reminder job and an RSVP submission near-simultaneously) are handled safely.
