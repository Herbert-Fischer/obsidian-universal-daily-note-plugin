import { describe, expect, it } from "vitest";
import { extractUsedJournalHeadings } from "./dailyNoteTimeline";
import { finalizeJournalHeadings } from "./journalHeadingFilter";

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
