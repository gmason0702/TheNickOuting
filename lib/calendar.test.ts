import { describe, expect, it } from "vitest";
import {
  buildGoogleCalendarUrl,
  buildIcsCalendar,
  golfCalendarEvent,
  receptionCalendarEvent,
  zonedTimeToUtc,
} from "./calendar";

describe("zonedTimeToUtc", () => {
  it("converts an Indianapolis (Eastern, DST-observing) wall-clock time to UTC", () => {
    // 2026-10-02 is before DST ends (first Sunday of November), so EDT (UTC-4) applies.
    expect(zonedTimeToUtc("2026-10-02", "14:00", "America/Indiana/Indianapolis").toISOString()).toBe(
      "2026-10-02T18:00:00.000Z",
    );
  });

  it("crosses midnight UTC correctly for a late evening local time", () => {
    expect(zonedTimeToUtc("2026-10-02", "19:30", "America/Indiana/Indianapolis").toISOString()).toBe(
      "2026-10-02T23:30:00.000Z",
    );
  });
});

describe("golfCalendarEvent / receptionCalendarEvent", () => {
  it("golf runs 2:00pm-6:00pm local, reception 6:00pm-7:30pm local", () => {
    const golf = golfCalendarEvent();
    const reception = receptionCalendarEvent();

    expect(golf.start.toISOString()).toBe("2026-10-02T18:00:00.000Z");
    expect(golf.end.toISOString()).toBe("2026-10-02T22:00:00.000Z");
    expect(reception.start.toISOString()).toBe("2026-10-02T22:00:00.000Z");
    expect(reception.end.toISOString()).toBe("2026-10-02T23:30:00.000Z");
  });
});

describe("buildIcsCalendar", () => {
  it("emits a VCALENDAR with one VEVENT per event, using UTC timestamps and the venue location", () => {
    const ics = buildIcsCalendar([golfCalendarEvent()]);

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART:20261002T180000Z");
    expect(ics).toContain("DTEND:20261002T220000Z");
    expect(ics).toContain("SUMMARY:Nick Jacobi Memorial Golf Tournament — Golf");
    expect(ics).toContain("LOCATION:Brendonwood Clubhouse\\, Indianapolis\\, IN 46226");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
  });

  it("includes multiple events when given both golf and reception", () => {
    const ics = buildIcsCalendar([golfCalendarEvent(), receptionCalendarEvent()]);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});

describe("buildGoogleCalendarUrl", () => {
  it("builds a Google Calendar template link with UTC dates and the venue location", () => {
    const url = new URL(buildGoogleCalendarUrl(golfCalendarEvent()));

    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20261002T180000Z/20261002T220000Z");
    expect(url.searchParams.get("location")).toBe("Brendonwood Clubhouse, Indianapolis, IN 46226");
  });
});
