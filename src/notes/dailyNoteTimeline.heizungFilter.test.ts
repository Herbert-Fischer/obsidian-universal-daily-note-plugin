import { describe, expect, it } from "vitest";
import {
  extractJournalLines,
  extractJournalLinesAllHeadings,
  extractUsedJournalHeadings,
  groupTimelineEntriesBySection,
  loadTagebuchTimelineEntries,
} from "./dailyNoteTimeline";

const heizungLueftungLines = [
  "## Tagebuch",
  "> [!tagebuch-ref] 01.07.2026",
  '> - 13:33 Installation Wasserversorgung ([[EFH Hettenhausen]]) ([[Heizung]]) ([[Heizungs-Tagebuch]]) <!-- udn-entry:{"id":"djvg","profile":"heizung","context":"Abschaltung: Durchflussteuerung","callout":"djvg"} -->',
  '> - 13:34 Lüftungswartung ([[EFH Hettenhausen]] · [[Lüftung]]) <!-- udn-entry:{"id":"duvi","profile":"lueftung","context":"Kontrolle/Wartung der Wohnraumfilter","callout":"duvi"} -->',
  "## Heizung",
  "> [!fire]+ Heizung (Callout Überschrift)",
  ">",
  "> Herr Thiel hat den Schlammabscheider installiert.",
  "",
  '<!-- udn-heizung-entry: {"entryId":"djvg","vorfall":"Abschaltung: Durchflussteuerung","detail":"Herr Thiel hat den Schlammabscheider installiert."} -->',
  "## Lüftung",
  "> [!wind]+ Lüftung (Test",
  ">",
  "> Filter gewechselt.",
  ">",
  "",
  '<!-- udn-lueftung-entry: {"entryId":"duvi","wartung":"Kontrolle/Wartung der Wohnraumfilter","detail":"Filter gewechselt."} -->',
];

describe("Heizung/Lüftung outline filter", () => {
  it("lists Heizung and Lüftung in used headings when composer meta exists", () => {
    expect(extractUsedJournalHeadings(heizungLueftungLines)).toEqual(
      expect.arrayContaining(["Heizung", "Lüftung"]),
    );
  });

  it("extracts Heizung entry from Tagebuch feed line", () => {
    const entries = loadTagebuchTimelineEntries(heizungLueftungLines).filter((e) => e.feedProfile === "heizung");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.text).toContain("13:33 Installation Wasserversorgung");
    expect(entries[0]?.text).toContain("[[Heizungs-Tagebuch]]");
  });

  it("extracts Lüftung entry from Tagebuch feed line", () => {
    const entries = loadTagebuchTimelineEntries(heizungLueftungLines).filter(
      (e) => e.feedProfile === "lueftung",
    );
    expect(entries).toHaveLength(1);
    // text is taken from the Tagebuch bullet line
    expect(entries[0]?.text).toContain("Lüftungswartung");
    expect(entries[0]?.feedProfile).toBe("lueftung");
    expect(entries[0]?.feedContext).toBe("Kontrolle/Wartung der Wohnraumfilter");
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
