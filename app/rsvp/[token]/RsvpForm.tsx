"use client";

import { useState } from "react";
import { EventHead } from "@/app/EventHead";
import { CheckIcon, XIcon } from "@/app/icons";
import { submitRsvp } from "./actions";

interface Props {
  token: string;
  name: string;
  fee: number;
  initialGolferCount: number;
  initialReceptionCount: number;
}

export function RsvpForm({ token, name, fee, initialGolferCount, initialReceptionCount }: Props) {
  const [golferCount, setGolferCount] = useState(initialGolferCount);
  const [receptionCount, setReceptionCount] = useState(initialReceptionCount);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ golferCount: number; receptionCount: number } | null>(
    null,
  );

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
        setConfirmed({ golferCount: result.golferCount, receptionCount: result.receptionCount });
      } else {
        setError("This link isn't valid.");
      }
    } catch {
      setError("Something went wrong submitting your RSVP. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    const isDecline = confirmed.golferCount === 0 && confirmed.receptionCount === 0;
    return (
      <main className="frame">
        <div className="card">
          <EventHead />
          <div className={`check-mark ${isDecline ? "declined" : "confirmed"}`}>
            {isDecline ? <XIcon /> : <CheckIcon />}
          </div>
          <span className={`status-chip ${isDecline ? "declined" : "confirmed"}`}>
            {isDecline ? "Not attending" : "Confirmed"}
          </span>
          <h1>
            {isDecline
              ? "Thanks for letting us know"
              : `You're on the list — ${confirmed.receptionCount} at the reception`}
          </h1>
          <p className="lede">
            {isDecline
              ? "You're marked as not attending this year."
              : "No payment needed for the reception — just show up."}{" "}
            If your plans change, just use this same link again.
          </p>
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
          Tell us how many from your group are golfing and how many are coming to the reception —
          0 is fine for either. You can come back and update this using the same link.
        </p>

        <div className="counters">
          <div className="counter-row">
            <div className="counter-body">
              <span className="counter-title">Golfing</span>
              <span className="counter-sub">${fee} per golfer — includes the round + reception</span>
            </div>
            <div className="stepper">
              <button
                className="stepper-btn"
                onClick={() => setGolferCount((c) => Math.max(0, c - 1))}
                disabled={golferCount === 0}
                aria-label="Decrease golfer count"
              >
                −
              </button>
              <span className="stepper-value">{golferCount}</span>
              <button
                className="stepper-btn"
                onClick={() => setGolferCount((c) => c + 1)}
                aria-label="Increase golfer count"
              >
                +
              </button>
            </div>
          </div>

          <div className="counter-row">
            <div className="counter-body">
              <span className="counter-title">Reception</span>
              <span className="counter-sub">Free — total people coming to celebrate</span>
            </div>
            <div className="stepper">
              <button
                className="stepper-btn"
                onClick={() => setReceptionCount((c) => Math.max(0, c - 1))}
                disabled={receptionCount === 0}
                aria-label="Decrease reception count"
              >
                −
              </button>
              <span className="stepper-value">{receptionCount}</span>
              <button
                className="stepper-btn"
                onClick={() => setReceptionCount((c) => c + 1)}
                aria-label="Increase reception count"
              >
                +
              </button>
            </div>
          </div>
        </div>

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
