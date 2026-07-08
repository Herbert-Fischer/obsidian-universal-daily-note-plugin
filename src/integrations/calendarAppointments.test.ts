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
  stripMarkdownCalendarAppointmentEntries,
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

  it("never syncs markdown vault files as Termin lines", () => {
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
          id: "md:Finanzen/Rechnungen/foo.md:rechnungsdatum",
          source: "markdown",
          title: "Rechnung",
          start: new Date(2026, 5, 22, 9, 0, 0, 0),
          allDay: false,
          filePath: "Finanzen/Rechnungen/foo.md",
          raw: { usedProperty: "rechnungsdatum" },
        },
        { ...DEFAULT_SYNC_SETTINGS, includeMarkdownNotes: true },
      ),
    ).toBe(false);
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

  it("uses stored link override for new sync entries", () => {
    const line = formatCalendarAppointmentEntry(
      {
        id: "evt-9",
        source: "caldav_event",
        title: "[[Lindengut]] mit [[Mona]]",
        start: new Date(2026, 6, 3, 13, 30, 0, 0),
        allDay: false,
      },
      undefined,
      "",
      { "evt-9": "[[Biohotel Lindengut|Lindengut]] mit [[Mona Buchmann|Mona]]" },
    );
    expect(line).toContain("Biohotel Lindengut");
    expect(line).toContain("<!-- udn-cal:evt-9 -->");
  });

  it("removes stale markdown invoice Termin lines on merge", () => {
    const existing = [
      "09:00 Termin: Rechnung [[Finanzen/foo]] <!-- udn-cal:md:Finanzen/Rechnungen/foo.md:rechnungsdatum -->",
      "10:30 Krebsnachsorgetermin Erbach",
    ];
    const merged = mergeCalendarAppointmentTexts(
      { plugins: { plugins: { "universal-calendar": { store: { getItemsForDay: () => [] } } } } } as never,
      new Date(2026, 5, 2),
      existing,
      { settings: DEFAULT_SYNC_SETTINGS },
    );
    expect(merged).toEqual(["10:30 Krebsnachsorgetermin Erbach"]);
  });

  it("strips markdown calendar ids", () => {
    const lines = [
      "09:00 Termin: Arzt <!-- udn-cal:caldav:event:abc -->",
      "09:00 Termin: Rechnung <!-- udn-cal:md:Finanzen/foo.md:rechnungsdatum -->",
    ];
    expect(stripMarkdownCalendarAppointmentEntries(lines)).toEqual([
      "09:00 Termin: Arzt <!-- udn-cal:caldav:event:abc -->",
    ]);
  });

  it("excludes garmin activity events from sync", () => {
    expect(
      isSyncableCalendarItem(
        {
          id: "caldav:event:garmin-99@denkarium",
          source: "caldav_event",
          title: "🥾 Wandern: Test",
          start: new Date(2026, 6, 7, 9, 0, 0, 0),
          allDay: false,
          raw: { uid: "garmin-99@denkarium" },
        },
        DEFAULT_SYNC_SETTINGS,
      ),
    ).toBe(false);
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
          id: "caldav:event:garmin-99@denkarium",
          source: "caldav_event",
          title: "🥾 Wandern: Test",
          start: new Date(2026, 5, 22, 11, 0, 0, 0),
          allDay: false,
          raw: { uid: "garmin-99@denkarium" },
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
