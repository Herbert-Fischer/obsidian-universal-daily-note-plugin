import { describe, expect, it } from "vitest";
import {
  applyWalkEntryMetaPatches,
  findWalkEntryMetaPatches,
  walkEntryNeedsGeoBackfill,
} from "./backfillTrackRegions";
import { WANDERN_ENTRY_META_PREFIX } from "../notes/wandernComposer";

describe("walkEntryNeedsGeoBackfill", () => {
  it("needs backfill when trackPath set without admin1", () => {
    expect(
      walkEntryNeedsGeoBackfill({
        entryId: "abc",
        titel: "Tour",
        kurz: "",
        beschreibung: "",
        trackPath: "Calendar/Anhänge/GPX/test.gpx",
        track: "",
      }),
    ).toBe(true);
  });

  it("skips when admin1 and county already present", () => {
    expect(
      walkEntryNeedsGeoBackfill({
        entryId: "abc",
        titel: "Tour",
        kurz: "",
        beschreibung: "",
        trackPath: "Calendar/Anhänge/GPX/test.gpx",
        track: "",
        admin1: "Hessen",
        county: "Landkreis Fulda",
      }),
    ).toBe(false);
  });

  it("needs backfill when county missing", () => {
    expect(
      walkEntryNeedsGeoBackfill({
        entryId: "abc",
        titel: "Tour",
        kurz: "",
        beschreibung: "",
        trackPath: "Calendar/Anhänge/GPX/test.gpx",
        track: "",
        admin1: "Hessen",
      }),
    ).toBe(true);
  });
});

describe("findWalkEntryMetaPatches", () => {
  it("finds entry meta lines needing geo", () => {
    const lines = [
      "## Wandern",
      `> ${WANDERN_ENTRY_META_PREFIX} {"entryId":"x1","titel":"Tour","kurz":"","beschreibung":"","trackPath":"a.gpx","track":""} -->`,
    ];
    const patches = findWalkEntryMetaPatches(lines);
    expect(patches).toHaveLength(1);
    expect(patches[0]?.lineIndex).toBe(1);
    expect(patches[0]?.meta.entryId).toBe("x1");
  });
});

describe("applyWalkEntryMetaPatches", () => {
  it("updates meta line preserving callout prefix", () => {
    const lines = [
      `> ${WANDERN_ENTRY_META_PREFIX} {"entryId":"x1","titel":"Tour","kurz":"","beschreibung":"","trackPath":"a.gpx","track":""} -->`,
    ];
    const patches = findWalkEntryMetaPatches(lines);
    const updated = applyWalkEntryMetaPatches(lines, [
      {
        ...patches[0]!,
        meta: {
          ...patches[0]!.meta,
          admin1: "Hessen",
          locality: "Hettenhausen",
        },
      },
    ]);
    expect(updated[0]).toContain('"admin1":"Hessen"');
    expect(updated[0]).toContain('"locality":"Hettenhausen"');
    expect(updated[0]?.startsWith("> ")).toBe(true);
  });
});
