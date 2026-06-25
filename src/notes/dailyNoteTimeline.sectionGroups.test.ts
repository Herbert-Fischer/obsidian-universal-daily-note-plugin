import { describe, expect, it } from "vitest";
import {
  extractJournalLinesAllHeadings,
  groupTimelineEntriesBySection,
} from "./dailyNoteTimeline";

describe("groupTimelineEntriesBySection", () => {
  const lines = [
    "## Tagebuch",
    "> [!tagebuch-ref] 03.05.2026",
    "> - 08:10 Aufstehen",
    "## Obsidian Plugin",
    "> [!notes] Obsidian Plugin",
    "> - Plugin-Entwicklung",
  ];

  it("groups Alle entries by section with callout titles", () => {
    const entries = extractJournalLinesAllHeadings(lines);
    const groups = groupTimelineEntriesBySection(lines, entries, "2026-05-03");
    expect(groups.map((g) => g.section)).toEqual(["Tagebuch", "Obsidian Plugin"]);
    expect(groups[0]?.calloutTitle).toBe("03.05.2026");
    expect(groups[1]?.calloutTitle).toBe("Obsidian Plugin");
    expect(groups[0]?.entries.map((e) => e.text)).toEqual(["08:10 Aufstehen"]);
    expect(groups[1]?.entries.map((e) => e.text)).toEqual(["Plugin-Entwicklung"]);
  });
});
