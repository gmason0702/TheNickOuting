import { formatEventDate } from "@/lib/cadence";
import { CheckIcon, FlagIcon, GlassIcon, TheNickLogo, XIcon } from "./icons";

export function Logo() {
  return (
    <div className="logo">
      <TheNickLogo />
    </div>
  );
}

function StatusBadge({ attending }: { attending: boolean }) {
  return (
    <div className={`head-status ${attending ? "confirmed" : "declined"}`}>
      {attending ? <CheckIcon /> : <XIcon />}
    </div>
  );
}

interface EventRowsProps {
  golfing?: boolean;
  reception?: boolean;
}

export function EventRows({ golfing, reception }: EventRowsProps = {}) {
  const eventDate = formatEventDate();
  return (
    <>
      <div className="head">
        <div className="mark">
          <FlagIcon />
        </div>
        <div>
          <p className="event">Golf Tournament</p>
          <p className="date">{eventDate} @ 3:00pm</p>
        </div>
        {golfing !== undefined && <StatusBadge attending={golfing} />}
      </div>
      <div className="head">
        <div className="mark">
          <GlassIcon />
        </div>
        <div>
          <p className="event">Reception</p>
          <p className="date">{eventDate} @ 5:00pm</p>
        </div>
        {reception !== undefined && <StatusBadge attending={reception} />}
      </div>
    </>
  );
}

export function EventHead(props: EventRowsProps = {}) {
  return (
    <>
      <Logo />
      <EventRows {...props} />
    </>
  );
}
