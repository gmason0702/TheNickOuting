"use client";

import { useState } from "react";
import { CalendarLinks } from "@/app/CalendarLinks";
import { EventHead } from "@/app/EventHead";
import { GolferReceptionCounters } from "@/app/rsvp/GolferReceptionCounters";
import { submitRsvp } from "./actions";

interface Props {
  token: string;
  name: string;
  fee: number;
  receptionFee: number;
  initialGolferCount: number;
  initialReceptionCount: number;
  /** Golfers already on the books across every other invite, i.e. excluding this one. */
  othersGolferCount: number;
}

interface ConfirmedState {
  golferCount: number;
  receptionCount: number;
  paymentPending: boolean;
  amountDue: number;
  refundNote: boolean;
}

export function RsvpForm({
  token,
  name,
  fee,
  receptionFee,
  initialGolferCount,
  initialReceptionCount,
  othersGolferCount,
}: Props) {
  const [golfing, setGolfing] = useState(initialGolferCount > 0);
  const [receptionCount, setReceptionCount] = useState(initialReceptionCount);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedState | null>(null);

  const golferCount = golfing ? 1 : 0;

  async function handleContinue() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitRsvp(token, golferCount, receptionCount);
      if (result.status === "redirect") {
        window.location.href = result.approveUrl;
        return;
      }
      if (result.status === "confirmed") {
        setConfirmed({
          golferCount: result.golferCount,
          receptionCount: result.receptionCount,
          paymentPending: false,
          amountDue: 0,
          refundNote: result.refundNote,
        });
      } else if (result.status === "confirmed-payment-pending") {
        setConfirmed({
          golferCount: result.golferCount,
          receptionCount: result.receptionCount,
          paymentPending: true,
          amountDue: result.amountDue,
          refundNote: false,
        });
      } else {
        setError("This link isn't valid.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong submitting your RSVP. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    const isDecline = confirmed.golferCount === 0 && confirmed.receptionCount === 0;

    let headline: string;
    let body: string;
    if (confirmed.paymentPending) {
      headline = `You're confirmed — ${confirmed.golferCount} golfing, ${confirmed.receptionCount} at the reception`;
      body = `You owe $${confirmed.amountDue.toFixed(2)} — payment collection isn't set up yet, we'll follow up separately once it's ready. No action needed from you right now.`;
    } else if (isDecline) {
      headline = "Thanks for letting us know";
      body = "You're marked as not attending this year.";
    } else {
      headline = `You're confirmed — ${confirmed.golferCount} golfing, ${confirmed.receptionCount} at the reception`;
      body = "No additional payment is due.";
    }
    if (confirmed.refundNote) {
      body +=
        " Since this is less than what you'd already paid, any refund will need to be coordinated with us directly.";
    }

    return (
      <main className="frame">
        <div className="card">
          <EventHead golfing={confirmed.golferCount > 0} reception={confirmed.receptionCount > 0} />
          <h1>{headline}</h1>
          <p className="lede">
            {body} If your plans change, just use this same link again.
          </p>
          {!isDecline && (
            <CalendarLinks golfing={confirmed.golferCount > 0} reception={confirmed.receptionCount > 0} />
          )}
          <button className="link-reset" onClick={() => setConfirmed(null)}>
            ← Update headcounts
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="frame">
      <div className="card">
        <EventHead />
        <h1>Hi {name}, who&apos;s joining us?</h1>
        <p className="lede">
          Let us know if you're golfing and how many are coming to the reception — 0 is fine for
          either. You can come back and update this using the same link.
        </p>

        <GolferReceptionCounters
          fee={fee}
          receptionFee={receptionFee}
          golfing={golfing}
          onGolfingChange={setGolfing}
          receptionCount={receptionCount}
          onReceptionCountChange={setReceptionCount}
          othersGolferCount={othersGolferCount}
        />

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        <button className="btn btn-primary" onClick={handleContinue} disabled={submitting}>
          Continue
        </button>
      </div>
    </main>
  );
}
