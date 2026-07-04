import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyFeedFiltersToEntries,
  extractJournalLines,
  extractJournalLinesAllHeadings,
  extractUsedJournalHeadings,
  loadTagebuchTimelineEntries,
} from "./dailyNoteTimeline";

const sonstigesNote = [
  "## Tagebuch",
  "",
  "> [!tagebuch-ref] 02.07.2026",
  "> - 07:05 Aufstehen",
  "> - 11:40 Mittagessen",
  "> <!-- udn-feed:profile=tagebuch context=\"Lilien von Otto\" -->",
  "> - 12:15 Otto Lilien ausgegraben",
  "> - 18:00 Spaziergang",
  "",
  "## Sonstiges",
  "> [!notes] Lilien von Otto",
  "> Lilien bei Otto im Garten ausgestochen.",
  "",
  '<!-- udn-sonstiges: {"titel":"Lilien von Otto","detail":"Lilien bei Otto im Garten ausgestochen.","feedTime":"12:15","feedKurz":"Otto Lilien ausgegraben"} -->',
];

describe("Sonstiges timeline", () => {
  it("shows Sonstiges feed title in Sonstiges outline filter", () => {
    const entries = extractJournalLines(sonstigesNote, "Sonstiges");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.text).toBe("12:15 Otto Lilien ausgegraben");
    expect(entries[0]?.section).toBe("Sonstiges");
  });

  it("includes Sonstiges in Alle view via meta comment", () => {
    const entries = extractJournalLinesAllHeadings(sonstigesNote);
    const sonstiges = entries.filter((e) => e.section === "Sonstiges");
    expect(sonstiges).toHaveLength(1);
    expect(sonstiges[0]?.text).toContain("12:15");
    expect(sonstiges[0]?.feedProfile).toBe("sonstiges");
  });

  it("exposes Sonstiges feed in Tagebuch section with feed context", () => {
    const entries = extractJournalLines(sonstigesNote, "Tagebuch");
    const feed = entries.find((e) => e.text.includes("12:15"));
    expect(feed?.feedProfile).toBe("tagebuch");
    expect(feed?.feedContext).toBe("Lilien von Otto");
  });

  it("detects Sonstiges sections with prose callout for heading filter", () => {
    expect(extractUsedJournalHeadings(sonstigesNote)).toContain("Sonstiges");
  });

  it("filters 2026-07-02 vault note to Sonstiges feed entry only", () => {
    const vaultPath = "/vault/Calendar/Notes/2026-07-02.md";
    const text = readFileSync(vaultPath, "utf8");
    const lines = text.split("\n");
    const entries = applyFeedFiltersToEntries(
      loadTagebuchTimelineEntries(lines),
      "Tagebuch",
      ["sonstiges"],
      "",
      false,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.text).toContain("Otto Lilien");
    expect(entries[0]?.feedContext).toBe("Lilien von Otto");
  });
});
