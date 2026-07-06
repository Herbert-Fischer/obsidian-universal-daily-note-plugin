import { describe, expect, it } from "vitest";
import {
  applyFeedFiltersToEntries,
  loadTagebuchTimelineEntries,
} from "./dailyNoteTimeline";
import { DEFAULT_JOURNAL_HEADING } from "../settings";

describe("heizung outline filter integration", () => {
  it("matches heizung entries via udn-entry tags in Tagebuch", () => {
    const lines = [
      "## Tagebuch",
      "> [!tagebuch-ref] 01.07.2026",
      "> ",
      '> - 13:34 Heizungsstörung ([[EFH Hettenhausen]]) ([[Heizung]]) ([[Heizungs-Tagebuch]]) ([[Operation Warmduscher]]) <!-- udn-entry:{"id":"h1","profile":"heizung","context":"Brennerausfall"} -->',
      "## Heizung",
      "",
      "> [!fire]+ Heizungsstörung",
      "> Brenner neu gestartet.",
      '<!-- udn-heizung-entry: {"entryId":"h1","vorfall":"Brennerausfall","detail":"Brenner neu gestartet."} -->',
    ];
    const entries = loadTagebuchTimelineEntries(lines);
    const filtered = applyFeedFiltersToEntries(entries, DEFAULT_JOURNAL_HEADING, ["heizung"], "", false);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((e) => e.feedProfile === "heizung")).toBe(true);
  });

  it("matches heizung via supplement title when udn-entry is missing", () => {
    const lines = [
      "## Tagebuch",
      "> [!tagebuch-ref] 01.07.2026",
      "> ",
      "> - 13:34 Heizungsstörung ([[Heizungs-Tagebuch]])",
      "## Heizung",
      "",
      "> [!fire]+ Heizungsstörung",
      "> Brenner neu gestartet.",
      '<!-- udn-heizung-entry: {"entryId":"h2","vorfall":"Brennerausfall","detail":"Brenner neu gestartet."} -->',
    ];
    const entries = loadTagebuchTimelineEntries(lines);
    const filtered = applyFeedFiltersToEntries(entries, DEFAULT_JOURNAL_HEADING, ["heizung"], "", false);
    expect(filtered.some((e) => e.feedProfile === "heizung")).toBe(true);
  });

  it("still supports legacy udn-heizung detail notes", () => {
    const lines = [
      "## Tagebuch",
      "> [!tagebuch-ref] 01.07.2026",
      "> <!-- udn-feed:profile=heizung -->",
      "> - 13:34 Heizungsstörung ([[Heizungs-Tagebuch]])",
      "## Heizung",
      "> [!fire]+ Heizung (Test",
      "> Brenner neu gestartet.",
      '<!-- udn-heizung: {"kurz":"Heizungsstörung","detail":"Brenner neu gestartet.","fotos":[],"titel":"Heizung (Test","feedTime":"13:34"} -->',
    ];
    const entries = loadTagebuchTimelineEntries(lines);
    const filtered = applyFeedFiltersToEntries(entries, DEFAULT_JOURNAL_HEADING, ["heizung"], "", false);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((e) => e.feedProfile === "heizung")).toBe(true);
  });
});
