import { CalendarLinks } from "@/app/CalendarLinks";
import { EventHead } from "@/app/EventHead";
import { findRowByToken } from "@/lib/sheets";
import { NotFound } from "../../NotFound";

export default async function ConfirmedPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const row = await findRowByToken(token);

  if (!row) return <NotFound />;

  if (row.paymentStatus === "paid") {
    return (
      <main className="frame">
        <div className="card">
          <EventHead golfing={(row.golfRsvpCount ?? 0) > 0} reception={(row.receptionCount ?? 0) > 0} />
          <h1>
            You&apos;re confirmed — {row.golfRsvpCount ?? 0} golfing, {row.receptionCount ?? 0} at the
            reception
          </h1>
          <p className="lede">Payment received. A confirmation email is on its way. See you on the course!</p>
          <CalendarLinks
            golfing={(row.golfRsvpCount ?? 0) > 0}
            reception={(row.receptionCount ?? 0) > 0}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="frame">
      <div className="card">
        <EventHead />
        <h1>Finishing up your payment</h1>
        <p className="lede">
          We&apos;re confirming your payment with PayPal — this can take a moment. You&apos;ll get a
          confirmation email as soon as it&apos;s done. If anything looks off, you can revisit your
          RSVP link at any time.
        </p>
      </div>
    </main>
  );
}
