import { describe, expect, it } from "vitest";
import {
  formatWalkStatsBeschreibungFromKurz,
  formatWalkStatsBeschreibungFromTrack,
  formatWalkStatsLines,
  mergeWalkStatsIntoBeschreibung,
  resolveWalkBeschreibung,
} from "./walkStatsBeschreibung";

describe("walkStatsBeschreibung", () => {
  it("formats Garmin-style kurz as Streckenlänge and Dauer lines", () => {
    expect(formatWalkStatsBeschreibungFromKurz("2,95 km · 1:01 h")).toBe(
      "Streckenlänge: 2,95\nDauer: 1:01 Std",
    );
  });

  it("formats track stats when kurz is empty", () => {
    expect(
      formatWalkStatsBeschreibungFromTrack({
        path: "x.gpx",
        name: "x.gpx",
        distanceKm: 2.95,
        durationSec: 3660,
        startLabel: null,
        endLabel: null,
      }),
    ).toBe("Streckenlänge: 2,95\nDauer: 1:01 Std");
  });

  it("keeps existing beschreibung", () => {
    expect(resolveWalkBeschreibung("Eigener Text", "2,95 km · 1:01 h", null)).toBe("Eigener Text");
  });

  it("falls back to kurz when beschreibung is empty", () => {
    expect(resolveWalkBeschreibung("", "2,95 km · 1:01 h", null)).toBe(
      "Streckenlänge: 2,95\nDauer: 1:01 Std",
    );
  });

  it("formats Garmin pending stats including elevation", () => {
    expect(
      formatWalkStatsLines({
        distanceKm: 6.79,
        durationSec: 7943,
        elevationGainM: 100,
      }),
    ).toBe("Streckenlänge: 6,79 km\nDauer: 2:12 Std\nHöhenmeter: 100 m");
  });

  it("prepends stats to existing beschreibung when missing", () => {
    expect(
      mergeWalkStatsIntoBeschreibung("Schöner Weg im Wald.", {
        distanceKm: 6.79,
        durationSec: 7943,
        elevationGainM: 100,
      }),
    ).toBe(
      "Streckenlänge: 6,79 km\nDauer: 2:12 Std\nHöhenmeter: 100 m\n\nSchöner Weg im Wald.",
    );
  });

  it("does not duplicate stats in beschreibung", () => {
    const existing = "Streckenlänge: 6,79 km\nDauer: 2:12 Std\n\nSchöner Weg.";
    expect(
      mergeWalkStatsIntoBeschreibung(existing, {
        distanceKm: 6.79,
        durationSec: 7943,
      }),
    ).toBe(existing);
  });
});
