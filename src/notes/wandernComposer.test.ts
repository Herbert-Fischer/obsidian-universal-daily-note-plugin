import { describe, expect, it } from "vitest";
import type { App, TFile } from "obsidian";
import type { ComposerEntry } from "./dailyComposer";
import {
  mergeWandernSupplementsIntoEntries,
  parseWandernEntryMetaLine,
  parseWandernSupplementsFromLines,
  renderWandernSectionBody,
  syncWandernSupplements,
  wandernEntryMetaComment,
} from "./wandernComposer";

function mockFile(path: string): TFile {
  return { path } as TFile;
}

describe("wandernComposer", () => {
  it("parses wandern entry meta comment", () => {
    const meta = parseWandernEntryMetaLine(
      '<!-- udn-wandern-entry: {"entryId":"w1","titel":"Alpen","kurz":"5 km","beschreibung":"Schön","trackPath":"Calendar/tracks/a.gpx","track":"a.gpx"} -->',
    );
    expect(meta?.entryId).toBe("w1");
    expect(meta?.titel).toBe("Alpen");
    expect(meta?.kurz).toBe("5 km");
  });

  it("parses wandern entry meta inside callout prefix", () => {
    const meta = parseWandernEntryMetaLine(
      '> <!-- udn-wandern-entry: {"entryId":"knvh","titel":"Alpen","kurz":"","beschreibung":"Tour","trackPath":"Calendar/a.gpx","track":"a.gpx"} -->',
    );
    expect(meta?.entryId).toBe("knvh");
    expect(meta?.beschreibung).toBe("Tour");
  });

  it("loads supplements from prefixed meta in ## Wandern", () => {
    const loaded = parseWandernSupplementsFromLines([
      "## Wandern",
      "",
      "> [!mountain]+ Alpen",
      "> Beschreibungstext",
      '> <!-- udn-wandern-entry: {"entryId":"knvh","titel":"Alpen","kurz":"","beschreibung":"Beschreibungstext","trackPath":"Calendar/a.gpx","track":"a.gpx","fotos":[]} -->',
    ]);
    expect(loaded.supplements.get("knvh")?.beschreibung).toBe("Beschreibungstext");
    expect(loaded.supplements.get("knvh")?.trackPath).toBe("Calendar/a.gpx");
  });

  it("merges real vault-style wandern block into composer entry", () => {
    const noteLines = [
      "## Wandern",
      "",
      "> [!mountain]+ Wandern: Bläsis Mühle - Kienberg",
      ">",
      "> > [!blank|wide-60]",
      "> > Beschreibung aus dem Callout.",
      "> > ```udn-track-3d",
      "> > path: Calendar/Anhänge/GPX/Wandern Bläsis Mühle.gpx",
      "> > ```",
      "> > [!blank-container|no-margin gallery gallery-row]",
      "> > ![[Calendar/Anhänge/Bilder/2026-06-14/foto1.jpg]] ![[Calendar/Anhänge/Bilder/2026-06-14/foto2.jpg]]",
      '> <!-- udn-wandern-entry: {"entryId":"knvh","titel":"Wandern: Bläsis Mühle - Kienberg","kurz":"","beschreibung":"Beschreibung aus dem Callout.","trackPath":"Calendar/Anhänge/GPX/Wandern Bläsis Mühle.gpx","track":"Wandern Bläsis Mühle.gpx","fotos":["![[Calendar/Anhänge/Bilder/2026-06-14/foto1.jpg]]","![[Calendar/Anhänge/Bilder/2026-06-14/foto2.jpg]]"],"layout":"gallery-row"} -->',
    ];
    const loaded = parseWandernSupplementsFromLines(noteLines);
    const merged = mergeWandernSupplementsIntoEntries(
      [
        {
          id: "line-19",
          line: 19,
          time: "09:45",
          body: "Wandern: Bläsis Mühle - Kienberg",
          rawLine: "> - 09:45 Wandern: Bläsis Mühle - Kienberg <!-- udn-entry:{\"id\":\"knvh\",\"profile\":\"wandern\",\"context\":\"Wandern: Bläsis Mühle - Kienberg\",\"callout\":\"knvh\"} -->",
          entryId: "knvh",
          profile: "wandern",
          context: "Wandern: Bläsis Mühle - Kienberg",
          calloutId: "knvh",
        },
      ],
      loaded,
    );
    expect(merged[0]?.supplementDetail).toContain("Beschreibung aus dem Callout");
    expect(merged[0]?.supplementTrackPath).toBe("Calendar/Anhänge/GPX/Wandern Bläsis Mühle.gpx");
    expect(merged[0]?.supplementPhotos?.length).toBeGreaterThanOrEqual(2);
    expect(merged[0]?.calloutId).toBe("knvh");
  });

  it("roundtrips supplements into composer entries", () => {
    const lines = [
      "## Wandern",
      "",
      "> [!mountain]+ Alpen",
      "> **Kurz:** 5 km",
      "> Schöne Tour",
      wandernEntryMetaComment({
        entryId: "w9",
        titel: "Alpen",
        kurz: "5 km",
        beschreibung: "Schöne Tour",
        trackPath: "",
        track: "",
      }),
    ];
    const loaded = parseWandernSupplementsFromLines(lines);
    const merged = mergeWandernSupplementsIntoEntries(
      [
        {
          id: "line-1",
          line: 1,
          time: "10:00",
          body: "Alpen",
          rawLine: "- 10:00 Alpen",
          entryId: "w9",
          profile: "wandern",
        },
      ],
      loaded,
    );
    expect(merged[0]?.supplementKurz).toBe("5 km");
    expect(merged[0]?.supplementDetail).toBe("Schöne Tour");
    expect(merged[0]?.context).toBe("Alpen");
    expect(merged[0]?.calloutId).toBe("w9");
  });

  it("renders callouts in time order", async () => {
    const body = await renderWandernSectionBody({} as App, [
      {
        entryId: "b2",
        time: "18:00",
        body: "Abendtour",
        context: "Abend",
        profile: "wandern",
        supplementKurz: "Spät",
        supplementDetail: "Abends",
      },
      {
        entryId: "a1",
        time: "10:00",
        body: "Morgentour",
        context: "Morgen",
        profile: "wandern",
        supplementKurz: "Früh",
        supplementDetail: "Morgens",
      },
    ], new Date("2026-07-03"), {
      template: "> [!mountain]+ {{titel}}\n> {{kurz}}\n> {{beschreibung}}",
      photosFolder: "Calendar/Anhänge/Bilder",
      tracksFolder: "Calendar/Anhänge/GPX",
      maxPhotos: 3,
      track3dEnabled: false,
      track3dHeight: 200,
      track3dElevationExaggeration: 4,
    });
    const joined = body.join("\n");
    const start = joined.indexOf("Morgen");
    const end = joined.indexOf("Abend");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(-1);
    expect(start).toBeLessThan(end);
  });

  it("removes orphan wandern callouts on sync", async () => {
    let disk = [
      "## Tagebuch",
      "",
      "> [!tagebuch-ref] 03.07.2026",
      '> - 10:00 Tour <!-- udn-entry:{"id":"keep","profile":"wandern","context":"Alt"} -->',
      "",
      "## Wandern",
      "",
      "> [!mountain]+ Verwaist",
      "> alt",
      wandernEntryMetaComment({
        entryId: "orphan",
        titel: "Alt",
        kurz: "alt",
        beschreibung: "alt",
        trackPath: "",
        track: "",
      }),
      "",
    ].join("\n");

    const app = {
      workspace: { getLeavesOfType: () => [] },
      metadataCache: { trigger: () => {} },
      vault: {
        adapter: {
          read: async () => disk,
          write: async (_path: string, content: string) => {
            disk = content;
          },
        },
      },
    } as unknown as App;

    const entries: ComposerEntry[] = [
      {
        id: "line-1",
        line: 4,
        time: "10:00",
        body: "Tour",
        rawLine: "",
        entryId: "keep",
        profile: "wandern",
        context: "Neu",
        supplementKurz: "Neu Kurz",
        supplementDetail: "Neu Detail",
      },
    ];

    await syncWandernSupplements(app, mockFile("2026-07-03.md"), entries, new Date("2026-07-03"), {
      template: "> [!mountain]+ {{titel}}\n> {{kurz}}\n> {{beschreibung}}",
      photosFolder: "Calendar/Anhänge/Bilder",
      tracksFolder: "Calendar/Anhänge/GPX",
      maxPhotos: 3,
      track3dEnabled: false,
      track3dHeight: 200,
      track3dElevationExaggeration: 4,
    });
    expect(disk).toContain("Neu Detail");
    expect(disk).toContain('"entryId":"keep"');
    expect(disk).not.toContain("orphan");
    expect(disk).not.toContain("Verwaist");
  });

  it("dedupes wandern sync entries with same title", async () => {
    let disk = [
      "## Tagebuch",
      "",
      "> [!tagebuch-ref] 14.06.2026",
      "",
      "## Wandern",
      "",
    ].join("\n");

    const app = {
      workspace: { getLeavesOfType: () => [] },
      metadataCache: { trigger: () => {} },
      vault: {
        adapter: {
          read: async () => disk,
          write: async (_path: string, content: string) => {
            disk = content;
          },
        },
      },
    } as unknown as App;

    const entries: ComposerEntry[] = [
      {
        id: "line-1",
        line: 1,
        time: "09:45",
        body: "Alpen",
        rawLine: "",
        entryId: "empty",
        profile: "wandern",
        context: "Alpen",
      },
      {
        id: "line-2",
        line: 2,
        time: "09:45",
        body: "Alpen",
        rawLine: "",
        entryId: "full",
        profile: "wandern",
        context: "Alpen",
        supplementDetail: "Tour",
      },
    ];

    await syncWandernSupplements(app, mockFile("2026-06-14.md"), entries, new Date("2026-06-14"), {
      template: "> [!mountain]+ {{titel}}\n> {{kurz}}\n> {{beschreibung}}",
      photosFolder: "Calendar/Anhänge/Bilder",
      tracksFolder: "Calendar/Anhänge/GPX",
      maxPhotos: 3,
      track3dEnabled: false,
      track3dHeight: 200,
      track3dElevationExaggeration: 4,
    });
    expect(disk.match(/\[!mountain\]/g)?.length ?? 0).toBe(1);
    expect(disk).toContain('"entryId":"full"');
    expect(disk).not.toContain('"entryId":"empty"');
  });
});
