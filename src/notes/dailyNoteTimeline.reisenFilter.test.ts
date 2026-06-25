import { describe, expect, it } from "vitest";
import {
  extractJournalLines,
  extractJournalLinesAllHeadings,
  extractReisenJournalLines,
} from "./dailyNoteTimeline";

const jun15Lines = [
  "## Tagebuch",
  "> [!tagebuch-ref] 15.06.2026",
  "> - 07:45 Aufstehen",
  "## Sonstiges",
  "> [!notes] Mamas 90ter Geburtstag",
  "> - [[Boxi]]tour Tag 6.3: **Gersfeld**",
  "> - [[Boxi]]tour Tag 6.2: **Oberrieden**",
];

const jun10Lines = [
  "## Tagebuch",
  "> [!tagebuch-ref] 10.06.2026",
  "> - 07:40 Aufstehen",
  "## Reisen",
  "> [!notes] Mamas 90ter Geburtstag",
  "> - [[Boxi]]tour Tag 1: **Höchst**",
];

describe("Reisen heading filter", () => {
  it("reads entries only from ## Reisen", () => {
    const entries = extractReisenJournalLines(jun10Lines);
    expect(entries.map((e) => e.text)).toEqual(["[[Boxi]]tour Tag 1: **Höchst**"]);
  });

  it("does not include legacy trip callouts under ## Sonstiges", () => {
    expect(extractReisenJournalLines(jun15Lines)).toEqual([]);
  });

  it("does not show trip callouts under Sonstiges filter", () => {
    expect(extractJournalLines(jun15Lines, "Sonstiges")).toEqual([]);
  });

  it("does not show trip callouts under Tagebuch filter", () => {
    const entries = extractJournalLines(jun10Lines, "Tagebuch");
    expect(entries.map((e) => e.text)).toEqual(["07:40 Aufstehen"]);
    expect(entries.some((e) => e.text.includes("Boxi"))).toBe(false);
  });

  it("labels misplaced trip callouts as Sonstiges in Alle filter", () => {
    const all = extractJournalLinesAllHeadings(jun15Lines);
    expect(all.map((e) => e.section)).toEqual(["Tagebuch", "Sonstiges", "Sonstiges"]);
  });

  it("does not pull other ## headings into Reisen filter", () => {
    const jan14Lines = [
      "## Tagebuch",
      "> [!tagebuch-ref] 14.01.2026",
      "> - Mit dem Boxi nach Erbach",
      "## Big Things Today",
      "> [!notes] Big Things Today",
      "> - Nachbarin vermutlich gestorben",
    ];
    const obsidianLines = [
      "## Tagebuch",
      "> [!tagebuch-ref] 03.05.2026",
      "> - 08:10 Aufstehen",
      "## Obsidian Plugin",
      "> [!notes] Obsidian Plugin",
      "> - Obsidian Plugin für Kontakte",
    ];
    expect(extractReisenJournalLines(jan14Lines)).toEqual([]);
    expect(extractReisenJournalLines(obsidianLines)).toEqual([]);
  });
});
