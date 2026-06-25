import { describe, expect, it } from "vitest";
import { groupTimelineDaysByTrip, type TimelineDay } from "./dailyNoteTimeline";

describe("groupTimelineDaysByTrip", () => {
  const day = (dateKey: string, tripLabel?: string): TimelineDay => ({
    dateKey,
    label: dateKey,
    filePath: `${dateKey}.md`,
    entries: [{ line: 1, text: "x", rawLine: "- x" }],
    summary: "",
    tripLabel,
  });

  it("groups consecutive days with same trip label", () => {
    const groups = groupTimelineDaysByTrip([
      day("2026-06-10", "Mamas 90ter Geburtstag"),
      day("2026-06-11", "Mamas 90ter Geburtstag"),
      day("2026-06-12", "Mamas 90ter Geburtstag"),
      day("2026-06-20"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.tripLabel).toBe("Mamas 90ter Geburtstag");
    expect(groups[0]!.days.map((d) => d.dateKey)).toEqual([
      "2026-06-12",
      "2026-06-11",
      "2026-06-10",
    ]);
    expect(groups[1]!.tripLabel).toBeNull();
  });
});
