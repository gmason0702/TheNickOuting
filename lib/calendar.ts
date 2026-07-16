import {
  EVENT_DATE,
  EVENT_LOCATION,
  EVENT_TIME_ZONE,
  GOLF_END_TIME,
  GOLF_START_TIME,
  RECEPTION_END_TIME,
  RECEPTION_START_TIME,
} from "./cadence";

export interface CalendarEvent {
  title: string;
  description: string;
  start: Date;
  end: Date;
}

/** How far a UTC instant's wall-clock reading in `timeZone` differs from UTC itself, in ms. */
function getTimeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/** Converts a "YYYY-MM-DD" + "HH:mm" wall-clock time in `timeZone` to the equivalent UTC instant, DST-aware. */
export function zonedTimeToUtc(dateStr: string, timeStr: string, timeZone: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  const [hh, mm] = timeStr.split(":").map(Number) as [number, number];
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const offsetMs = getTimeZoneOffsetMs(guess, timeZone);
  return new Date(guess.getTime() - offsetMs);
}

export function golfCalendarEvent(): CalendarEvent {
  return {
    title: "Nick Jacobi Memorial Golf Tournament — Golf",
    description: "Golf tournament round.",
    start: zonedTimeToUtc(EVENT_DATE, GOLF_START_TIME, EVENT_TIME_ZONE),
    end: zonedTimeToUtc(EVENT_DATE, GOLF_END_TIME, EVENT_TIME_ZONE),
  };
}

export function receptionCalendarEvent(): CalendarEvent {
  return {
    title: "Nick Jacobi Memorial Golf Tournament — Reception",
    description: "Post-golf reception.",
    start: zonedTimeToUtc(EVENT_DATE, RECEPTION_START_TIME, EVENT_TIME_ZONE),
    end: zonedTimeToUtc(EVENT_DATE, RECEPTION_END_TIME, EVENT_TIME_ZONE),
  };
}

function formatIcsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\n/g, "\\n");
}

export function buildIcsCalendar(events: CalendarEvent[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Nick Jacobi Memorial Golf Tournament//RSVP//EN",
    "CALSCALE:GREGORIAN",
  ];
  const stamp = formatIcsUtc(new Date());
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${formatIcsUtc(event.start)}-${escapeIcsText(event.title)}@thenickouting.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${formatIcsUtc(event.start)}`,
      `DTEND:${formatIcsUtc(event.end)}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      `DESCRIPTION:${escapeIcsText(event.description)}`,
      `LOCATION:${escapeIcsText(EVENT_LOCATION)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function buildGoogleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${formatIcsUtc(event.start)}/${formatIcsUtc(event.end)}`,
    details: event.description,
    location: EVENT_LOCATION,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
