import { describe, expect, it } from "vitest";
import {
  formatCalendarAppointmentEntry,
  mergeCalendarAppointmentTexts,
} from "./calendarAppointments";
import {
  collectCalendarSyncIds,
  parseCalendarSyncId,
  stripCalendarSyncMarker,
  withCalendarSyncMarker,
} from "./calendarSyncMarker";

describe("calendar appointment journal lines", () => {
  it("formats timed CalDAV events as Termin lines", () => {
    const line = formatCalendarAppointmentEntry(
      {
        id: "evt-1",
        source: "caldav_event",
        title: "Notar",
        start: new Date(2026, 5, 22, 10, 50, 0, 0),
        allDay: false,
      },
      { enabled: true, allDayTime: "09:00", includeTodos: false, syncOnOutlineLoad: true },
    );
    expect(line).toBe("10:50 Termin: Notar <!-- udn-cal:evt-1 -->");
  });

  it("uses all-day default time", () => {
    const line = formatCalendarAppointmentEntry(
      {
        id: "evt-2",
        source: "caldav_event",
        title: "Geburtstag",
        start: new Date(2026, 5, 22, 0, 0, 0, 0),
        allDay: true,
      },
      { enabled: true, allDayTime: "09:00", includeTodos: false, syncOnOutlineLoad: true },
    );
    expect(line.startsWith("09:00 Termin: Geburtstag")).toBe(true);
  });

  it("parses and strips sync markers", () => {
    const body = withCalendarSyncMarker("Termin: Notar", "evt-1");
    expect(parseCalendarSyncId(`10:50 ${body}`)).toBe("evt-1");
    expect(stripCalendarSyncMarker(body)).toBe("Termin: Notar");
  });

  it("does not duplicate known calendar ids", () => {
    const existing = ["10:50 Termin: Notar <!-- udn-cal:evt-1 -->"];
    expect(collectCalendarSyncIds(existing)).toEqual(new Set(["evt-1"]));

    const merged = mergeCalendarAppointmentTexts(
      { plugins: { plugins: { "universal-calendar": { store: { getItemsForDay: () => [
        {
          id: "evt-1",
          source: "caldav_event",
          title: "Notar",
          start: new Date(2026, 5, 22, 10, 50, 0, 0),
          allDay: false,
        },
        {
          id: "evt-2",
          source: "caldav_event",
          title: "Abendessen",
          start: new Date(2026, 5, 22, 18, 0, 0, 0),
          allDay: false,
        },
      ] } } } } } as never,
      new Date(2026, 5, 22),
      existing,
      { settings: { enabled: true, allDayTime: "09:00", includeTodos: false, syncOnOutlineLoad: true } },
    );

    expect(merged).toHaveLength(2);
    expect(merged[1]).toContain("evt-2");
  });
});
