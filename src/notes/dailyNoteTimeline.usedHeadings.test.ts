import { describe, expect, it } from "vitest";
import { extractAllH2Headings, extractUsedJournalHeadings } from "./dailyNoteTimeline";
import { finalizeJournalHeadings } from "./journalHeadingFilter";

describe("extractAllH2Headings", () => {
  it("returns all ## headings including empty sections", () => {
    const lines = ["## Tagebuch", "- entry", "## Reisen", "## Sonstiges", "nur Text"];
    expect(extractAllH2Headings(lines)).toEqual(["Tagebuch", "Reisen", "Sonstiges"]);
  });
});

describe("extractUsedJournalHeadings", () => {
  it("returns only ## sections with list entries", () => {
    const lines = [
      "# Daily",
      "## Tagebuch",
      "- 12:00 Mittagessen: A",
      "## Leer",
      "## Sonstiges",
      "- Spaziergang: am See",
      "## Aufgaben",
      "- [ ] Task",
      "## Nur Text",
      "kein bullet",
    ];
    expect(extractUsedJournalHeadings(lines)).toEqual(["Tagebuch", "Sonstiges", "Aufgaben"]);
    expect(finalizeJournalHeadings(extractUsedJournalHeadings(lines))).toEqual([
      "Tagebuch",
      "Sonstiges",
    ]);
  });

  it("ignores sections without list entries", () => {
    const lines = ["## Tagebuch", "nur Text", "## Sonstiges", "- real entry"];
    expect(extractUsedJournalHeadings(lines)).toEqual(["Sonstiges"]);
  });
});
