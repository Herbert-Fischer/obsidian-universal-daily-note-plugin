import { describe, expect, it } from "vitest";
import {
  caldavUidFromCalendarItem,
  garminCalendarSyncId,
  isGarminActivityCalendarItem,
} from "./garminCalendarFilter";

describe("garminCalendarFilter", () => {
  it("detects garmin UID on caldav item", () => {
    const item = {
      id: "caldav:event:garmin-12345678901@denkarium",
      source: "caldav_event" as const,
      title: "🥾 Wandern: Heidküppel",
      start: new Date(2026, 6, 7, 11, 2, 0, 0),
      allDay: false,
      raw: { uid: "garmin-12345678901@denkarium" },
    };
    expect(caldavUidFromCalendarItem(item)).toBe("garmin-12345678901@denkarium");
    expect(isGarminActivityCalendarItem(item)).toBe(true);
  });

  it("detects garmin activity categories", () => {
    expect(
      isGarminActivityCalendarItem({
        id: "caldav:event:some-other-uid",
        source: "caldav_event",
        title: "Spaziergang",
        start: new Date(),
        allDay: false,
        raw: { uid: "some-other-uid", categories: ["Spaziergang"] },
      }),
    ).toBe(true);
  });

  it("does not flag normal appointments", () => {
    expect(
      isGarminActivityCalendarItem({
        id: "caldav:event:1a4305a8-c08f-4243-81e0-898cb6a43d87",
        source: "caldav_event",
        title: "Zahnarzt",
        start: new Date(),
        allDay: false,
        raw: { uid: "1a4305a8-c08f-4243-81e0-898cb6a43d87" },
      }),
    ).toBe(false);
  });

  it("builds stable garmin calendar sync id", () => {
    expect(garminCalendarSyncId("99")).toBe("caldav:event:garmin-99@denkarium");
  });
});
