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

  const style = { fontFamily: "sans-serif", padding: "48px 16px", maxWidth: 460, margin: "0 auto" };

  if (row.paymentStatus === "paid") {
    return (
      <main style={style}>
        <h1>
          You&apos;re confirmed — {row.golfRsvpCount ?? 0} golfing, {row.receptionCount ?? 0} at the
          reception
        </h1>
        <p>Payment received. A confirmation email is on its way. See you on the course!</p>
      </main>
    );
  }

  return (
    <main style={style}>
      <h1>Finishing up your payment</h1>
      <p>
        We&apos;re confirming your payment with PayPal — this can take a moment. You&apos;ll get a
        confirmation email as soon as it&apos;s done. If anything looks off, you can revisit your
        RSVP link at any time.
      </p>
    </main>
  );
}
