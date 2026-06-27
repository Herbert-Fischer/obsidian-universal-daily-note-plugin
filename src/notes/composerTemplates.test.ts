import { describe, expect, it } from "vitest";
import {
  appendLocationToCalloutTitle,
  applyTrackToPrefixEntry,
  calloutTitleHasWeather,
  chipEntriesToAdd,
  entriesHavePrefix,
  entryHasPrefix,
  TAGEBUCH_BULK_CHIPS,
  templatesForHeading,
  WANDERN_BULK_CHIPS,
} from "./composerTemplates";
import type { ComposerEntry } from "./dailyComposer";
import type { TrackMatch } from "../tracks/gpxImport";

const defaultTemplateSettings = {
  tagebuchBulkEnabled: true,
  reisenBulkEnabled: true,
  wandernBulkEnabled: true,
  lastTripLabel: "",
};

describe("composerTemplates", () => {
  it("returns tagebuch bulk template for Tagebuch heading", () => {
    const packs = templatesForHeading("Tagebuch", defaultTemplateSettings);
    expect(packs.some((p) => p.id === "tagebuch-bulk")).toBe(true);
    expect(templatesForHeading("Arbeit", defaultTemplateSettings)).toHaveLength(0);
  });

  it("returns wandern bulk template for Wandern heading", () => {
    const packs = templatesForHeading("Wandern", defaultTemplateSettings);
    expect(packs.some((p) => p.id === "wandern-bulk")).toBe(true);
    expect(packs[0]?.actions).toEqual(["location", "track", "photo"]);
  });

  it("hides wandern bulk when disabled in settings", () => {
    const packs = templatesForHeading("Wandern", {
      ...defaultTemplateSettings,
      wandernBulkEnabled: false,
    });
    expect(packs).toHaveLength(0);
  });

  it("detects existing entry prefixes", () => {
    const entries: ComposerEntry[] = [
      { id: "1", line: 1, time: "12:00", body: "Mittagessen: Pasta", rawLine: "- 12:00 Mittagessen: Pasta" },
    ];
    expect(entryHasPrefix(entries[0]!, "Mittagessen:")).toBe(true);
    expect(entriesHavePrefix(entries, "Spaziergang:")).toBe(false);
  });

  it("adds only missing chip entries when onlyMissing", () => {
    const existing: ComposerEntry[] = [
      { id: "1", line: 1, time: "07:30", body: "Aufstehen", rawLine: "- 07:30 Aufstehen" },
    ];
    const adds = chipEntriesToAdd(TAGEBUCH_BULK_CHIPS, existing, true);
    expect(adds.some((e) => e.body.startsWith("Mittagessen:"))).toBe(true);
    expect(adds.some((e) => e.body === "Aufstehen")).toBe(false);
  });

  it("adds wandern bulk chips with expected prefixes", () => {
    const adds = chipEntriesToAdd(WANDERN_BULK_CHIPS, [], false);
    expect(adds.some((e) => e.body.startsWith("Kurzbeschreibung:"))).toBe(true);
    expect(adds.some((e) => e.body.startsWith("Beschreibung:"))).toBe(true);
    expect(adds.some((e) => e.body.startsWith("Start:"))).toBe(true);
  });

  it("applyTrackToPrefixEntry fills Track: prefix for wandern", () => {
    const track: TrackMatch = {
      path: "Calendar/Tracks/2026-06-24.gpx",
      name: "2026-06-24.gpx",
      distanceKm: 14.2,
      durationSec: 4.25 * 3600,
      startLabel: null,
      endLabel: null,
    };
    const entries: ComposerEntry[] = [
      { id: "1", line: 1, time: "15:00", body: "Track:", rawLine: "- 15:00 Track:" },
    ];
    const next = applyTrackToPrefixEntry(entries, track, "Track:");
    expect(next[0]!.body).toContain("Track:");
    expect(next[0]!.body).toContain("14,2 km");
    expect(next[0]!.body).toContain("[[Calendar/Tracks/2026-06-24.gpx|Track]]");
  });

  it("applyTrackToPrefixEntry still supports Etappe: for reisen", () => {
    const track: TrackMatch = {
      path: "Calendar/Tracks/trip.gpx",
      name: "trip.gpx",
      distanceKm: 8,
      durationSec: 2 * 3600,
      startLabel: null,
      endLabel: null,
    };
    const next = applyTrackToPrefixEntry([], track, "Etappe:");
    expect(next[0]!.body.startsWith("Etappe:")).toBe(true);
    expect(next[0]!.time).toBe("12:00");
  });

  it("detects weather in callout title", () => {
    expect(calloutTitleHasWeather("24.06.2026 · ⛅ 18–29 °C bewölkt")).toBe(true);
    expect(calloutTitleHasWeather("Reisen [Italien]")).toBe(false);
  });

  it("appends location to callout title", () => {
    expect(appendLocationToCalloutTitle("Reisen [Rhön]", "Gersfeld, Hessen")).toBe(
      "Reisen [Rhön] · Gersfeld",
    );
  });
});
