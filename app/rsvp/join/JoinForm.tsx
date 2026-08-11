"use client";

import { useState } from "react";
import { CalendarLinks } from "@/app/CalendarLinks";
import { EventHead } from "@/app/EventHead";
import { GolferReceptionCounters } from "@/app/rsvp/GolferReceptionCounters";
import { submitJoin } from "./actions";

interface Props {
  fee: number;
  receptionFee: number;
  othersGolferCount: number;
}

type Step = "details" | "counts";

interface ConfirmedState {
  golferCount: number;
  receptionCount: number;
  paymentPending: boolean;
  amountDue: number;
  rsvpLink: string;
}

export function JoinForm({ fee, receptionFee, othersGolferCount }: Props) {
  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [golfing, setGolfing] = useState(false);
  const [receptionCount, setReceptionCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedState | null>(null);

  const golferCount = golfing ? 1 : 0;

  function handleDetailsContinue() {
    setError(null);
    if (!name.trim()) {
      setError("Enter your name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setStep("counts");
  }

  async function handleCountsContinue() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitJoin(name, email, golferCount, receptionCount);
      if (result.status === "closed") {
        setError("Walk-in registration just closed. Please check back later.");
        return;
      }
      if (result.status === "redirect") {
        window.location.href = result.checkoutUrl;
        return;
      }
      setConfirmed({
        golferCount: result.golferCount,
        receptionCount: result.receptionCount,
        paymentPending: result.status === "confirmed-payment-pending",
        amountDue: result.status === "confirmed-payment-pending" ? result.amountDue : 0,
        rsvpLink: result.rsvpLink,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong submitting your RSVP. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <main className="frame">
        <div className="card">
          <EventHead golfing={confirmed.golferCount > 0} reception={confirmed.receptionCount > 0} />
          <h1>You&apos;re on the list, {name.split(" ")[0]}</h1>
          <p className="lede">
            {confirmed.paymentPending
              ? `You owe $${confirmed.amountDue.toFixed(2)} — payment collection isn't set up yet, we'll follow up separately once it's ready.`
              : "No payment is due."}{" "}
            We&apos;ve emailed {email} a personal link — use it any time to update your headcounts.
          </p>
          <CalendarLinks golfing={confirmed.golferCount > 0} reception={confirmed.receptionCount > 0} />
          <p className="note">Your link: {confirmed.rsvpLink}</p>
        </div>
      </main>
    );
  }

  if (step === "details") {
    return (
      <main className="frame">
        <div className="card">
          <EventHead />
          <h1>Join us for The Nick</h1>
          <p className="lede">
            Haven&apos;t received an email yet? No problem. Enter your name and email to RSVP —
            we&apos;ll send you a personal link afterward so you can come back and update your
            headcounts any time. Can&apos;t attend this year? RSVP &quot;No&quot; anyways so we
            have your updated contact information for next year.
          </p>

          <div className="field">
            <label className="field-label" htmlFor="join-name">
              Name
            </label>
            <input
              id="join-name"
              className="field-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Golfer"
            />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="join-email">
              Email
            </label>
            <input
              id="join-email"
              className="field-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
            />
          </div>

          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}

          <button className="btn btn-primary" onClick={handleDetailsContinue}>
            Continue
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="frame">
      <div className="card">
        <EventHead />
        <h1>Hi {name.split(" ")[0]}, who&apos;s joining us?</h1>
        <p className="lede">
          Let us know if you&apos;re golfing and how many are coming to the reception — 0 is fine
          for either.
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

        <button className="btn btn-primary" onClick={handleCountsContinue} disabled={submitting}>
          Continue
        </button>
        <button className="link-reset" onClick={() => setStep("details")}>
          ← Back
        </button>
      </div>
    </main>
  );
}
