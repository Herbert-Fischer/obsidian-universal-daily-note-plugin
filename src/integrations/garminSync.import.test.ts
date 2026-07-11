import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { composerEntryText, dedupeSupplementProfileEntries, entryToComposer } from "../notes/dailyComposer";
import { extractJournalLines } from "../notes/dailyNoteTimeline";
import { mergeSpaziergangSupplementsIntoEntries, parseSpaziergangSupplementsFromLines } from "../notes/spaziergangComposer";
import { collectGarminSyncIds, parseGarminSyncId } from "./garminSyncMarker";
import { enrichEntryForGarminImport, mergeGarminJournalEntries, type GarminPendingActivity } from "./garminSync";

const NOTE_PATH = "/vault/Calendar/Notes/2026-07-10.md";

const activity: GarminPendingActivity = {
  garminId: "23549581738",
  date: "2026-07-10",
  startTime: "16:43",
  endTime: "18:56",
  title: "Wanderparkplatz Haukeller via Altenfeld nach Hause",
  profile: "spaziergang",
  gpxPath:
    "Calendar/Anhänge/GPX/2026-07-10-Spaziergang-wanderparkplatz-haukeller-via-altenfeld-nach-hau.gpx",
  distanceKm: 6.79,
  durationSec: 7943,
  elevationGainM: 100,
};

describe("garmin import vault note 2026-07-10", () => {
  it("detects already-imported garmin id and enriches stats", () => {
    let text = "";
    try {
      text = readFileSync(NOTE_PATH, "utf8");
    } catch {
      return;
    }

    const lines = text.split("\n");
    let entries = extractJournalLines(lines, "Tagebuch").map(entryToComposer);
    const spaziergangLoaded = parseSpaziergangSupplementsFromLines(lines);
    entries = mergeSpaziergangSupplementsIntoEntries(entries, spaziergangLoaded);
    entries = dedupeSupplementProfileEntries(entries);

    const existing = entries.map(composerEntryText);
    const merged = mergeGarminJournalEntries(existing, activity);
    const changed =
      merged.length !== existing.length || merged.some((line, index) => line !== existing[index]);
    const alreadyImported = collectGarminSyncIds(existing).has(activity.garminId);

    expect(alreadyImported).toBe(true);
    expect(changed).toBe(false);

    const enriched = entries
      .map((entry) => {
        if (parseGarminSyncId(composerEntryText(entry)) !== activity.garminId) return entry;
        return enrichEntryForGarminImport(entry, activity);
      })
      .find((entry) => parseGarminSyncId(composerEntryText(entry)) === activity.garminId);

    expect(enriched?.supplementKurz).toContain("6,79 km");
    expect(enriched?.supplementDetail).toContain("Streckenlänge:");
    expect(enriched?.supplementDetail).toContain("Höhenmeter:");
    expect(enriched?.supplementDetail).toContain("Steffi hat mich");
  });
});
