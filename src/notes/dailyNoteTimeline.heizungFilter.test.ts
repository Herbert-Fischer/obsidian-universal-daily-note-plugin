import { describe, expect, it } from "vitest";
import {
  extractJournalLines,
  extractJournalLinesAllHeadings,
  extractUsedJournalHeadings,
  groupTimelineEntriesBySection,
} from "./dailyNoteTimeline";

const heizungLueftungLines = [
  "## Tagebuch",
  "> [!tagebuch-ref] 01.07.2026",
  "> <!-- udn-feed:profile=heizung -->",
  "> - 13:33 Installation Wasserversorgung ([[EFH Hettenhausen]]) ([[Heizung]]) ([[Heizungs-Tagebuch]]) ([[Operation Warmduscher]])",
  "## Heizung",
  "> [!fire]+ Heizung (Callout Überschrift)",
  ">",
  "> Herr Thiel hat den Schlammabscheider installiert.",
  "",
  '<!-- udn-heizung: {"kurz":"Installation Wasserversorgung","detail":"Herr Thiel hat den Schlammabscheider installiert.","fotos":[],"titel":"Heizung (Callout Überschrift)","feedTime":"13:33"} -->',
  "## Lüftung",
  "> [!wind]+ Lüftung (Test",
  ">",
  "> Filter gewechselt.",
  ">",
  "> <!-- udn-feed:profile=lueftung context=\"Lüftung (Test\" -->",
  "> - 13:34 Lüftungswartung ([[EFH Hettenhausen]] · [[Lüftungs-Tagebuch]])",
  "",
  '<!-- udn-lueftung: {"kurz":"Lüftungswartung","detail":"Filter gewechselt.","fotos":[],"titel":"Lüftung (Test","feedTime":"13:34"} -->',
];

describe("Heizung/Lüftung outline filter", () => {
  it("lists Heizung and Lüftung in used headings when composer meta exists", () => {
    expect(extractUsedJournalHeadings(heizungLueftungLines)).toEqual(
      expect.arrayContaining(["Heizung", "Lüftung"]),
    );
  });

  it("extracts Heizung entry from Tagebuch feed line", () => {
    const entries = extractJournalLines(heizungLueftungLines, "Heizung");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.text).toContain("13:33 Installation Wasserversorgung");
    expect(entries[0]?.text).toContain("[[Heizungs-Tagebuch]]");
    expect(entries[0]?.feedProfile).toBe("heizung");
  });

  it("extracts Lüftung entry from Tagebuch feed line", () => {
    const entries = extractJournalLines(heizungLueftungLines, "Lüftung");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.text).toContain("13:34 Lüftungswartung");
    expect(entries[0]?.feedProfile).toBe("lueftung");
    expect(entries[0]?.feedContext).toBe("Lüftung (Test");
  });

  it("includes Heizung and Lüftung in Alle with section groups", () => {
    const entries = extractJournalLinesAllHeadings(heizungLueftungLines);
    expect(entries.some((e) => e.section === "Heizung")).toBe(true);
    expect(entries.some((e) => e.section === "Lüftung")).toBe(true);

    const groups = groupTimelineEntriesBySection(heizungLueftungLines, entries, "2026-07-01");
    expect(groups.find((g) => g.section === "Heizung")?.calloutTitle).toBe("Heizung (Callout Überschrift)");
    expect(groups.find((g) => g.section === "Lüftung")?.calloutTitle).toBe("Lüftung (Test");
  });
});
