import { describe, expect, it } from "vitest";
import { filterLinesByText, filterTimelineDaysByText } from "./entryTextFilter";
import type { TimelineDay } from "./dailyNoteTimeline";

describe("entryTextFilter", () => {
  const days: TimelineDay[] = [
    {
      dateKey: "2026-01-27",
      label: "2026-01-27",
      filePath: "a.md",
      entries: [
        { line: 1, text: "12:00 Mittagessen: Pizza", rawLine: "- 12:00 Mittagessen: Pizza" },
        { line: 2, text: "15:00 Spaziergang: See", rawLine: "- 15:00 Spaziergang: See" },
      ],
    },
  ];

  it("filters timeline days by substring", () => {
    const filtered = filterTimelineDaysByText(days, "Mittagessen:");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.entries).toHaveLength(1);
    expect(filterLinesByText([{ line: "abc" }, { line: "Mittagessen: x" }], "mittagessen")).toHaveLength(1);
  });

  it("returns all when query empty", () => {
    expect(filterTimelineDaysByText(days, "")).toEqual(days);
  });
});
