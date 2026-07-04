import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import {
  applyFeedFiltersToEntries,
  extractReisenJournalLines,
  loadTagebuchTimelineEntries,
  type TimelineEntry,
} from "./dailyNoteTimeline";
import { DEFAULT_JOURNAL_HEADING } from "../settings";
import { rewriteJournalBullets } from "./dailyComposer";
import { appendEntryMeta, entryMetaFromProfile } from "./journalEntryMeta";
import { formatJournalEntryText, parseJournalEntryDisplay } from "./parseJournalEntryDisplay";
import { mergeCalendarAppointmentTexts } from "../integrations/calendarAppointments";

const DEFAULT_SYNC_SETTINGS = {
  enabled: true,
  includeTodos: false,
  syncOnOutlineLoad: true,
  includeMarkdownNotes: false,
};

function loadTagebuchEntries(lines: string[]) {
  return loadTagebuchTimelineEntries(lines);
}

function entriesToStoredLines(entries: TimelineEntry[]): string[] {
  return entries.map((entry) => {
    const { time, body } = parseJournalEntryDisplay(entry.text);
    const meta = entryMetaFromProfile(
      entry.feedProfile,
      entry.feedContext,
      entry.entryId,
      entry.calloutId,
    );
    return appendEntryMeta(formatJournalEntryText(time ?? "", body), meta);
  });
}

function afterCalendarMerge(vaultPath: string): TimelineEntry[] {
  const text = readFileSync(vaultPath, "utf8");
  const lines = text.split("\n");
  const entries = loadTagebuchEntries(lines);
  const existing = entries.map((e) => {
    const { time, body } = parseJournalEntryDisplay(e.text);
    return formatJournalEntryText(time ?? "", body);
  });
  const merged = mergeCalendarAppointmentTexts(
    { plugins: { plugins: { "universal-calendar": { store: { getItemsForDay: () => [] } } } } } as never,
    new Date(2026, 5, 2),
    existing,
    { settings: DEFAULT_SYNC_SETTINGS },
  );
  const rewritten = rewriteJournalBullets(lines, DEFAULT_JOURNAL_HEADING, merged);
  return loadTagebuchEntries(rewritten);
}

describe("reisen outline filter integration", () => {
  it("finds reisen entries in 2026-06-01 daily note", () => {
    const text = readFileSync("/vault/Calendar/Notes/2026-06-01.md", "utf8");
    const lines = text.split("\n");
    const entries = loadTagebuchEntries(lines);
    const reisen = entries.filter((e) => e.feedProfile === "reisen");
    expect(reisen.length).toBeGreaterThan(0);
    const filtered = applyFeedFiltersToEntries(entries, "Tagebuch", ["reisen"], "", false);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((e) => e.feedProfile === "reisen")).toBe(true);
  });

  it("finds reisen entries in 2026-07-03 daily note", () => {
    const text = readFileSync("/vault/Calendar/Notes/2026-07-03.md", "utf8");
    const lines = text.split("\n");
    const entries = loadTagebuchEntries(lines);
    const filtered = applyFeedFiltersToEntries(entries, "Tagebuch", ["reisen"], "", true);
    expect(filtered.some((e) => e.feedProfile === "reisen")).toBe(true);
  });

  it("finds reisen via ## Reisen section when Tagebuch has no udn-entry tags", () => {
    const text = readFileSync("/vault/Calendar/Notes/2026-06-02.md", "utf8");
    const lines = text.split("\n");
    const entries = loadTagebuchEntries(lines);
    const filtered = applyFeedFiltersToEntries(entries, "Tagebuch", ["reisen"], "", true);
    expect(filtered.some((e) => e.feedProfile === "reisen")).toBe(true);
  });

  it("loads 2026-07-03 via tagebuch reisen tags when ## Reisen has no bullets", () => {
    const text = readFileSync("/vault/Calendar/Notes/2026-07-03.md", "utf8");
    const lines = text.split("\n");
    expect(extractReisenJournalLines(lines)).toHaveLength(0);
    const fromTagebuch = loadTagebuchEntries(lines).filter((e) => e.feedProfile === "reisen");
    expect(fromTagebuch.length).toBeGreaterThan(0);
  });

  it("finds reisen for 2026-06-10 (Reisen section only, legacy callout)", () => {
    const text = readFileSync("/vault/Calendar/Notes/2026-06-10.md", "utf8");
    const lines = text.split("\n");
    const entries = loadTagebuchEntries(lines);
    const filtered = applyFeedFiltersToEntries(entries, "Tagebuch", ["reisen"], "", true);
    expect(filtered.some((e) => e.feedProfile === "reisen")).toBe(true);
  });

  it("still finds reisen after calendar sync strips md invoice lines", () => {
    const after = afterCalendarMerge("/vault/Calendar/Notes/2026-06-02.md");
    const filtered = applyFeedFiltersToEntries(after, "Tagebuch", ["reisen"], "", true);
    expect(filtered.some((e) => e.feedProfile === "reisen")).toBe(true);
  });

  it("finds reisen when Tagebuch tags were stripped but ## Reisen supplements remain", () => {
    const text = readFileSync("/vault/Calendar/Notes/2026-07-03.md", "utf8");
    const lines = text
      .split("\n")
      .map((line) => line.replace(/\s*<!--\s*udn-entry:[^>]+-->/g, ""));
    const entries = loadTagebuchEntries(lines);
    const filtered = applyFeedFiltersToEntries(entries, "Tagebuch", ["reisen"], "", true);
    expect(filtered.some((e) => e.feedProfile === "reisen")).toBe(true);
  });

  it("survives composer save roundtrip (calendar sync path)", () => {
    const text = readFileSync("/vault/Calendar/Notes/2026-06-01.md", "utf8");
    const lines = text.split("\n");
    const before = loadTagebuchEntries(lines);
    expect(before.some((e) => e.feedProfile === "reisen")).toBe(true);

    const stored = entriesToStoredLines(before);
    const rewritten = rewriteJournalBullets(lines, DEFAULT_JOURNAL_HEADING, stored);
    const after = loadTagebuchEntries(rewritten);
    const filtered = applyFeedFiltersToEntries(after, "Tagebuch", ["reisen"], "", true);
    expect(filtered.some((e) => e.feedProfile === "reisen")).toBe(true);
  });

  it("reisen only without rest returns only reisen lines on 2026-07-03", () => {
    const text = readFileSync("/vault/Calendar/Notes/2026-07-03.md", "utf8");
    const lines = text.split("\n");
    const entries = loadTagebuchEntries(lines);
    const filtered = applyFeedFiltersToEntries(entries, "Tagebuch", ["reisen"], "", false);
    expect(filtered.length).toBe(2);
    expect(filtered.every((e) => e.feedProfile === "reisen")).toBe(true);
  });

  it("survives composer save roundtrip on 2026-07-03", () => {
    const text = readFileSync("/vault/Calendar/Notes/2026-07-03.md", "utf8");
    const lines = text.split("\n");
    const before = loadTagebuchEntries(lines);
    expect(before.some((e) => e.feedProfile === "reisen")).toBe(true);

    const stored = entriesToStoredLines(before);
    const rewritten = rewriteJournalBullets(lines, DEFAULT_JOURNAL_HEADING, stored);
    const after = loadTagebuchEntries(rewritten);
    const filtered = applyFeedFiltersToEntries(after, "Tagebuch", ["reisen"], "", false);
    expect(filtered.length).toBe(2);
    expect(filtered.every((e) => e.feedProfile === "reisen")).toBe(true);
  });

  it("still finds at least one reisen when tags stripped without rest on 2026-07-03", () => {
    const text = readFileSync("/vault/Calendar/Notes/2026-07-03.md", "utf8");
    const lines = text
      .split("\n")
      .map((line) => line.replace(/\s*<!--\s*udn-entry:[^>]+-->/g, ""));
    const entries = loadTagebuchEntries(lines);
    const filtered = applyFeedFiltersToEntries(entries, "Tagebuch", ["reisen"], "", false);
    expect(filtered.length).toBe(2);
    expect(filtered.every((e) => e.feedProfile === "reisen")).toBe(true);
  });

  it("still finds reisen after calendar merge on 2026-07-03", () => {
    const after = afterCalendarMerge("/vault/Calendar/Notes/2026-07-03.md");
    const filtered = applyFeedFiltersToEntries(after, "Tagebuch", ["reisen"], "", false);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((e) => e.feedProfile === "reisen")).toBe(true);
  });
});
