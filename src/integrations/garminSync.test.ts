import { describe, expect, it } from "vitest";
import {
  buildGarminJournalLine,
  mergeGarminJournalEntries,
  normalizeGarminMatchTitle,
  stripMatchingCalendarTerminEntries,
} from "./garminSync";
import { parseGarminSyncId } from "./garminSyncMarker";

describe("garminSync dedup", () => {
  const activity = {
    garminId: "12345678901",
    date: "2026-07-07",
    startTime: "11:02",
    title: "Heidküppel",
    profile: "spaziergang" as const,
    gpxPath: "Calendar/Anhänge/GPX/2026-07-07.gpx",
    distanceKm: 4.2,
    durationSec: 3720,
  };

  it("strips matching Termin line by garmin caldav id", () => {
    const lines = [
      "11:02 Termin: 🚶 Spaziergang: Heidküppel <!-- udn-cal:caldav:event:garmin-12345678901@denkarium -->",
      "12:00 Mittagessen:",
    ];
    expect(stripMatchingCalendarTerminEntries(lines, activity)).toEqual(["12:00 Mittagessen:"]);
  });

  it("strips matching Termin line by time and title", () => {
    const lines = [
      "11:02 Termin: Spaziergang: Heidküppel <!-- udn-cal:caldav:event:other-uid -->",
      "10:00 Termin: Arzt <!-- udn-cal:caldav:event:abc -->",
    ];
    expect(stripMatchingCalendarTerminEntries(lines, activity)).toEqual([
      "10:00 Termin: Arzt <!-- udn-cal:caldav:event:abc -->",
    ]);
  });

  it("builds journal line with garmin marker and profile meta", () => {
    const line = buildGarminJournalLine(activity);
    expect(line).toContain("11:02 Spaziergang: Heidküppel");
    expect(parseGarminSyncId(line)).toBe("12345678901");
    expect(line).toContain('"profile":"spaziergang"');
  });

  it("normalizes termin titles for matching", () => {
    expect(normalizeGarminMatchTitle("Termin: 🥾 Wandern: Alpen")).toBe("wandern: alpen");
  });

  it("updates existing garmin journal line without duplicate", () => {
    const original = buildGarminJournalLine(activity);
    const updatedActivity = { ...activity, title: "Heidküppel Rundweg", startTime: "11:30" };
    const merged = mergeGarminJournalEntries([original, "12:00 Mittagessen:"], updatedActivity);
    expect(merged).toHaveLength(2);
    const garminLines = merged.filter((line) => parseGarminSyncId(line) === activity.garminId);
    expect(garminLines).toHaveLength(1);
    expect(garminLines[0]).toContain("11:30 Spaziergang: Heidküppel Rundweg");
    expect(garminLines[0]).toContain('"id":');
  });
});
