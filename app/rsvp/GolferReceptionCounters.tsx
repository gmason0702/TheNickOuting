"use client";

import { MAX_GOLFERS, golferCapacityStatus } from "@/lib/capacity";

interface Props {
  fee: number;
  receptionFee: number;
  golfing: boolean;
  onGolfingChange: (golfing: boolean) => void;
  receptionCount: number;
  onReceptionCountChange: (count: number) => void;
  /** Golfers already on the books across every other invite, i.e. excluding this one. */
  othersGolferCount: number;
}

export function GolferReceptionCounters({
  fee,
  receptionFee,
  golfing,
  onGolfingChange,
  receptionCount,
  onReceptionCountChange,
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
          <span className="counter-title">How many are coming to the reception?</span>
          <span className="counter-sub">${receptionFee} per person</span>
        </div>
        <div className="stepper">
          <button
            className="stepper-btn"
            onClick={() => onReceptionCountChange(Math.max(0, receptionCount - 1))}
            disabled={receptionCount === 0}
            aria-label="Decrease reception count"
          >
            −
          </button>
          <span className="stepper-value">{receptionCount}</span>
          <button
            className="stepper-btn"
            onClick={() => onReceptionCountChange(receptionCount + 1)}
            aria-label="Increase reception count"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
