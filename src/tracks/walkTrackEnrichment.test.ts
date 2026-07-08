import { describe, expect, it } from "vitest";
import { spaziergangEntryMetaComment } from "../notes/spaziergangComposer";
import { parseWalkTrackMountsFromContent } from "./walkTrackEnrichment";

describe("walkTrackEnrichment", () => {
  it("detects spaziergang track mounts missing udn-track-3d block", () => {
    const content = [
      "## Spaziergang",
      "> [!person-walking]+ Spaziergang: Parkrunde",
      "> Beschreibung",
      spaziergangEntryMetaComment({
        entryId: "s1",
        titel: "Spaziergang: Parkrunde",
        kurz: "",
        beschreibung: "Beschreibung",
        trackPath: "Calendar/Anhänge/GPX/park.gpx",
        track: "park.gpx",
      }),
    ].join("\n");

    expect(parseWalkTrackMountsFromContent(content)).toEqual([
      { profile: "spaziergang", trackPath: "Calendar/Anhänge/GPX/park.gpx" },
    ]);
  });

  it("skips entries that already contain udn-track-3d", () => {
    const content = [
      "## Wandern",
      "> [!mountain]+ Wandern: Tour",
      "> > > ```udn-track-3d",
      "> > > path: Calendar/a.gpx",
      "> > > height: 280",
      "> > > exaggeration: 4",
      "> > > ```",
      '<!-- udn-wandern-entry: {"entryId":"w1","titel":"Wandern: Tour","kurz":"","beschreibung":"","trackPath":"Calendar/a.gpx","track":"a.gpx"} -->',
    ].join("\n");

    expect(parseWalkTrackMountsFromContent(content)).toEqual([]);
  });
});
