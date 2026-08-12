"use client";

import { MAX_GOLFERS, golferCapacityStatus } from "@/lib/capacity";

interface Props {
  fee: number;
  receptionFee: number;
  golfing: boolean;
  onGolfingChange: (golfing: boolean) => void;
  receptionAdultCount: number;
  onReceptionAdultCountChange: (count: number) => void;
  receptionChildCount: number;
  onReceptionChildCountChange: (count: number) => void;
  /** Golfers already on the books across every other invite, i.e. excluding this one. */
  othersGolferCount: number;
}

export function GolferReceptionCounters({
  fee,
  receptionFee,
  golfing,
  onGolfingChange,
  receptionAdultCount,
  onReceptionAdultCountChange,
  receptionChildCount,
  onReceptionChildCountChange,
  othersGolferCount,
}: Props) {
  const golferCount = golfing ? 1 : 0;
  const liveGolferTotal = othersGolferCount + golferCount;
  const newSignupCapacity = golferCapacityStatus(othersGolferCount);
  const golfLocked = !golfing && newSignupCapacity === "full";

  return (
    <div className="counters">
      <div className="counter-row">
        <div className="counter-body">
          <span className="counter-title">Are you golfing?</span>
          <span className="counter-sub">${fee} per golfer — includes the reception</span>
          <span className="capacity-note">
            {liveGolferTotal}/{MAX_GOLFERS} golfers registered
          </span>
          {!golfing && newSignupCapacity === "almost-full" && (
            <span className="capacity-note capacity-warning">
              Golf is almost full — only {MAX_GOLFERS - othersGolferCount} spot
              {MAX_GOLFERS - othersGolferCount === 1 ? "" : "s"} left.
            </span>
          )}
          {golfLocked && (
            <span className="capacity-note capacity-full">
              Golf is at maximum capacity ({MAX_GOLFERS}/{MAX_GOLFERS}).
            </span>
          )}
        </div>
        <button
          type="button"
          className={`toggle ${golfing ? "toggle-on" : ""}`}
          role="switch"
          aria-checked={golfing}
          aria-label="Golfing"
          disabled={golfLocked}
          onClick={() => onGolfingChange(!golfing)}
        >
          <span className="toggle-thumb" />
        </button>
      </div>

      <div className="counter-row">
        <div className="counter-body">
          <span className="counter-title">How many adults are coming to the reception?</span>
          <span className="counter-sub">${receptionFee} per adult</span>
        </div>
        <div className="stepper">
          <button
            className="stepper-btn"
            onClick={() => onReceptionAdultCountChange(Math.max(0, receptionAdultCount - 1))}
            disabled={receptionAdultCount === 0}
            aria-label="Decrease adult reception count"
          >
            −
          </button>
          <span className="stepper-value">{receptionAdultCount}</span>
          <button
            className="stepper-btn"
            onClick={() => onReceptionAdultCountChange(receptionAdultCount + 1)}
            aria-label="Increase adult reception count"
          >
            +
          </button>
        </div>
      </div>

      <div className="counter-row">
        <div className="counter-body">
          <span className="counter-title">How many children are coming to the reception?</span>
          <span className="counter-sub">Free — just for our headcount</span>
        </div>
        <div className="stepper">
          <button
            className="stepper-btn"
            onClick={() => onReceptionChildCountChange(Math.max(0, receptionChildCount - 1))}
            disabled={receptionChildCount === 0}
            aria-label="Decrease child reception count"
          >
            −
          </button>
          <span className="stepper-value">{receptionChildCount}</span>
          <button
            className="stepper-btn"
            onClick={() => onReceptionChildCountChange(receptionChildCount + 1)}
            aria-label="Increase child reception count"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
