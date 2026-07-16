import {
  buildGoogleCalendarUrl,
  buildIcsCalendar,
  golfCalendarEvent,
  receptionCalendarEvent,
} from "@/lib/calendar";

interface Props {
  golfing: boolean;
  reception: boolean;
}

export function CalendarLinks({ golfing, reception }: Props) {
  if (!golfing && !reception) return null;

  const events = [
    ...(golfing ? [golfCalendarEvent()] : []),
    ...(reception ? [receptionCalendarEvent()] : []),
  ];
  const icsHref = `data:text/calendar;charset=utf-8,${encodeURIComponent(buildIcsCalendar(events))}`;

  return (
    <div className="calendar-links">
      <span className="calendar-links-label">Add to calendar</span>
      <div className="calendar-links-row">
        {golfing && (
          <a
            className="link-reset"
            href={buildGoogleCalendarUrl(golfCalendarEvent())}
            target="_blank"
            rel="noopener noreferrer"
          >
            Golf → Google Calendar
          </a>
        )}
        {reception && (
          <a
            className="link-reset"
            href={buildGoogleCalendarUrl(receptionCalendarEvent())}
            target="_blank"
            rel="noopener noreferrer"
          >
            Reception → Google Calendar
          </a>
        )}
        <a className="link-reset" href={icsHref} download="nick-jacobi-golf-tournament.ics">
          Download .ics
        </a>
      </div>
    </div>
  );
}
