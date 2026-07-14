Status: open
Labels: wayfinder:grilling
Assignee: (unclaimed)
Blocked-by: (none)

# Define invitee / RSVP / payment data model (Sheet schema)

## Question

What columns/fields does the Google Sheet (the system of record) need to represent: an invitee (name, email), their golf RSVP status, their reception RSVP status, payment status/amount/timestamp, their personalized-link token, and the invite/reminder send history (e.g. last sent date, reminder count) needed to drive the escalating reminder cadence? Define the schema so it stays human-readable in Sheets while also being easy for the app to read/write, and keep it normalized enough that adding a price tier or add-on later doesn't require reshaping it.
