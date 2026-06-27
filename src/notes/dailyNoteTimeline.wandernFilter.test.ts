import { describe, expect, it } from "vitest";
import {
  extractJournalLines,
  extractJournalLinesAllHeadings,
  extractUsedJournalHeadings,
  groupTimelineEntriesBySection,
} from "./dailyNoteTimeline";

const wandernLines = [
  "## Tagebuch",
  "> [!tagebuch-ref] 14.06.2026",
  "> - 09:45 Wandern: Bläsis Mühle",
  "## Wandern",
  "> [!mountain]+ Wandern: Bläsis Mühle",
  ">",
  "> > [!multi-column]",
  "> > **Kurz:** Wanderung in Pfronten",
  '<!-- udn-wandern: {"titel":"Wandern: Bläsis Mühle","kurz":"Wanderung in Pfronten","beschreibung":"","track":"","trackPath":"","fotos":[]} -->',
];

describe("Wandern outline filter", () => {
  it("lists Wandern in used headings when composer meta exists", () => {
    expect(extractUsedJournalHeadings(wandernLines)).toContain("Wandern");
  });

  it("extracts Wandern entry from meta comment", () => {
    const entries = extractJournalLines(wandernLines, "Wandern");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.text).toBe("Kurzbeschreibung: Wanderung in Pfronten");
  });

  it("includes Wandern in Alle with section group and callout title", () => {
    const entries = extractJournalLinesAllHeadings(wandernLines);
    expect(entries.some((e) => e.section === "Wandern")).toBe(true);

    const groups = groupTimelineEntriesBySection(wandernLines, entries, "2026-06-14");
    const wandernGroup = groups.find((g) => g.section === "Wandern");
    expect(wandernGroup?.calloutTitle).toBe("Wandern: Bläsis Mühle");
    expect(wandernGroup?.entries.map((e) => e.text)).toEqual([
      "Kurzbeschreibung: Wanderung in Pfronten",
    ]);
  });
});
