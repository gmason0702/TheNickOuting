import { formatEventDate } from "@/lib/cadence";
import { FlagIcon } from "./icons";

export function EventHead() {
  return (
    <div className="head">
      <div className="mark">
        <FlagIcon />
      </div>
      <div>
        <p className="event">Golf Tournament</p>
        <p className="date">{formatEventDate()}</p>
      </div>
    </div>
  );
}
