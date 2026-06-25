import { describe, expect, it } from "vitest";
import { extractJournalLines, extractJournalLinesAllHeadings } from "./dailyNoteTimeline";

describe("extractJournalLinesAllHeadings", () => {
  const lines = [
    "## Tagebuch",
    "> [!tagebuch-ref] 12.06.2026",
    "> - 07:30 Aufstehen",
    "## Reisen",
    "> - [[Boxi]]: **Ottobeuren**",
    "## Aufgaben",
    "- [ ] Task",
  ];

  it("merges non-excluded sections", () => {
    const all = extractJournalLinesAllHeadings(lines);
    expect(all.map((e) => e.text)).toEqual(["07:30 Aufstehen", "[[Boxi]]: **Ottobeuren**"]);
    expect(all.map((e) => e.section)).toEqual(["Tagebuch", "Reisen"]);
  });

  it("single heading still works", () => {
    expect(extractJournalLines(lines, "Tagebuch").map((e) => e.text)).toEqual(["07:30 Aufstehen"]);
  });
});
