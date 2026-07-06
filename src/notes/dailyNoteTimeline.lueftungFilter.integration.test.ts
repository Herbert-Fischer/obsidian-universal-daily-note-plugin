import { describe, expect, it } from "vitest";
import {
  applyFeedFiltersToEntries,
  loadTagebuchTimelineEntries,
} from "./dailyNoteTimeline";
import { DEFAULT_JOURNAL_HEADING } from "../settings";

describe("lueftung outline filter integration", () => {
  it("matches lueftung entries via udn-entry tags in Tagebuch", () => {
    const lines = [
      "## Tagebuch",
      "> [!tagebuch-ref] 01.07.2026",
      "> ",
      '> - 13:34 Lüftungswartung ([[EFH Hettenhausen]] · [[Lüftungs-Tagebuch]]) <!-- udn-entry:{"id":"l1","profile":"lueftung","context":"Filterwechsel 2026"} -->',
      "## Lüftung",
      "",
      "> [!wind]+ Lüftungswartung",
      "> Filter gewechselt.",
      '<!-- udn-lueftung-entry: {"entryId":"l1","wartung":"Filterwechsel 2026","detail":"Filter gewechselt."} -->',
    ];
    const entries = loadTagebuchTimelineEntries(lines);
    const filtered = applyFeedFiltersToEntries(entries, DEFAULT_JOURNAL_HEADING, ["lueftung"], "", false);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((e) => e.feedProfile === "lueftung")).toBe(true);
  });

  it("matches lueftung via supplement title when udn-entry is missing", () => {
    const lines = [
      "## Tagebuch",
      "> [!tagebuch-ref] 01.07.2026",
      "> ",
      "> - 13:34 Lüftungswartung ([[Lüftungs-Tagebuch]])",
      "## Lüftung",
      "",
      "> [!wind]+ Lüftungswartung",
      "> Filter gewechselt.",
      '<!-- udn-lueftung-entry: {"entryId":"l2","wartung":"Filterwechsel 2026","detail":"Filter gewechselt."} -->',
    ];
    const entries = loadTagebuchTimelineEntries(lines);
    const filtered = applyFeedFiltersToEntries(entries, DEFAULT_JOURNAL_HEADING, ["lueftung"], "", false);
    expect(filtered.some((e) => e.feedProfile === "lueftung")).toBe(true);
  });

  it("still supports legacy udn-lueftung detail notes", () => {
    const lines = [
      "## Tagebuch",
      "> [!tagebuch-ref] 01.07.2026",
      "> <!-- udn-feed:profile=lueftung -->",
      "> - 13:34 Lüftungswartung ([[EFH Hettenhausen]] · [[Lüftungs-Tagebuch]])",
      "## Lüftung",
      "> [!wind]+ Lüftung (Test",
      "> Filter gewechselt.",
      '<!-- udn-lueftung: {"kurz":"Lüftungswartung","detail":"Filter gewechselt.","fotos":[],"titel":"Lüftung (Test","feedTime":"13:34"} -->',
    ];
    const entries = loadTagebuchTimelineEntries(lines);
    const filtered = applyFeedFiltersToEntries(entries, DEFAULT_JOURNAL_HEADING, ["lueftung"], "", false);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((e) => e.feedProfile === "lueftung")).toBe(true);
  });
});
