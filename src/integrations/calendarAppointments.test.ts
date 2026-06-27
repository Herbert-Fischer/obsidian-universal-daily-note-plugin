import { describe, expect, it } from "vitest";
import {
  formatCalendarAppointmentEntry,
  getCalendarItemsForDay,
  isSyncableCalendarItem,
  mergeCalendarAppointmentTexts,
} from "./calendarAppointments";
import {
  collectCalendarSyncIds,
  parseCalendarSyncId,
  stripCalendarSyncMarker,
  withCalendarSyncMarker,
} from "./calendarSyncMarker";

const DEFAULT_SYNC_SETTINGS = {
  enabled: true,
  includeTodos: false,
  syncOnOutlineLoad: true,
  includeMarkdownNotes: false,
};

describe("calendar appointment journal lines", () => {
  it("formats timed CalDAV events as Termin lines", () => {
    const line = formatCalendarAppointmentEntry({
      id: "evt-1",
      source: "caldav_event",
      title: "Notar",
      start: new Date(2026, 5, 22, 10, 50, 0, 0),
      allDay: false,
    });
    expect(line).toBe("10:50 Termin: Notar <!-- udn-cal:evt-1 -->");
  });

  it("excludes all-day events from sync", () => {
    expect(
      isSyncableCalendarItem(
        {
          id: "evt-2",
          source: "caldav_event",
          title: "Geburtstag",
          start: new Date(2026, 5, 22, 0, 0, 0, 0),
          allDay: true,
        },
        DEFAULT_SYNC_SETTINGS,
      ),
    ).toBe(false);
  });

  it("excludes markdown vault files by default", () => {
    expect(
      isSyncableCalendarItem(
        {
          id: "md-1",
          source: "markdown",
          title: "Projekt",
          start: new Date(2026, 5, 22, 14, 0, 0, 0),
          allDay: false,
          filePath: "Efforts/Projects/Projekt.md",
        },
        DEFAULT_SYNC_SETTINGS,
      ),
    ).toBe(false);
    expect(
      isSyncableCalendarItem(
        {
          id: "md-1",
          source: "markdown",
          title: "Projekt",
          start: new Date(2026, 5, 22, 14, 0, 0, 0),
          allDay: false,
          filePath: "Efforts/Projects/Projekt.md",
        },
        { ...DEFAULT_SYNC_SETTINGS, includeMarkdownNotes: true },
      ),
    ).toBe(true);
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
        {
          id: "evt-3",
          source: "caldav_event",
          title: "Feiertag",
          start: new Date(2026, 5, 22, 0, 0, 0, 0),
          allDay: true,
        },
      ] } } } } } as never,
      new Date(2026, 5, 22),
      existing,
      { settings: DEFAULT_SYNC_SETTINGS },
    );

    expect(merged).toHaveLength(2);
    expect(merged[1]).toContain("evt-2");
    expect(merged.some((l) => l.includes("evt-3"))).toBe(false);
  });

  it("filters all-day and markdown in getCalendarItemsForDay", () => {
    const items = getCalendarItemsForDay(
      { plugins: { plugins: { "universal-calendar": { store: { getItemsForDay: () => [
        {
          id: "evt-timed",
          source: "caldav_event",
          title: "Arzt",
          start: new Date(2026, 5, 22, 9, 30, 0, 0),
          allDay: false,
        },
        {
          id: "evt-allday",
          source: "caldav_event",
          title: "Urlaub",
          start: new Date(2026, 5, 22, 0, 0, 0, 0),
          allDay: true,
        },
        {
          id: "md-1",
          source: "markdown",
          title: "Notiz",
          start: new Date(2026, 5, 22, 10, 0, 0, 0),
          allDay: false,
          filePath: "Daily/foo.md",
        },
      ] } } } } } as never,
      new Date(2026, 5, 22),
      DEFAULT_SYNC_SETTINGS,
    );
    expect(items.map((i) => i.id)).toEqual(["evt-timed"]);
  });
});
