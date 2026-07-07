import { describe, expect, it } from "vitest";
import {
  extractJournalLines,
  extractJournalLinesAllHeadings,
  extractUsedJournalHeadings,
  groupTimelineEntriesBySection,
} from "./dailyNoteTimeline";

const spaziergangLines = [
  "## Tagebuch",
  "> [!tagebuch-ref] 14.06.2026",
  "> - 09:45 Spaziergang: Parkrunde",
  "## Spaziergang",
  "> [!person-walking]+ Spaziergang: Parkrunde",
  ">",
  "> > [!multi-column]",
  "> > **Kurz:** Runde am See",
  '<!-- udn-spaziergang: {"titel":"Spaziergang: Parkrunde","kurz":"Runde am See","beschreibung":"","track":"","trackPath":"","fotos":[]} -->',
];

describe("Spaziergang outline filter", () => {
  it("lists Spaziergang in used headings when composer meta exists", () => {
    expect(extractUsedJournalHeadings(spaziergangLines)).toContain("Spaziergang");
  });

  it("extracts Spaziergang entry from meta comment", () => {
    const entries = extractJournalLines(spaziergangLines, "Spaziergang");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.text).toBe("Kurzbeschreibung: Runde am See");
  });

  it("includes Spaziergang in Alle with section group and callout title", () => {
    const entries = extractJournalLinesAllHeadings(spaziergangLines);
    expect(entries.some((e) => e.section === "Spaziergang")).toBe(true);

    const groups = groupTimelineEntriesBySection(spaziergangLines, entries, "2026-06-14");
    const grp = groups.find((g) => g.section === "Spaziergang");
    expect(grp?.calloutTitle).toBe("Spaziergang: Parkrunde");
    expect(grp?.entries.map((e) => e.text)).toEqual(["Kurzbeschreibung: Runde am See"]);
  });
});

