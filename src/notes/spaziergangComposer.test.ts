import { describe, expect, it } from "vitest";
import type { App, TFile } from "obsidian";
import type { ComposerEntry } from "./dailyComposer";
import {
  mergeSpaziergangSupplementsIntoEntries,
  parseSpaziergangEntryMetaLine,
  parseSpaziergangSupplementsFromLines,
  renderSpaziergangSectionBody,
  spaziergangCalloutTitle,
  spaziergangEntryMetaComment,
  syncSpaziergangSupplements,
} from "./spaziergangComposer";

function mockFile(path: string): TFile {
  return { path } as TFile;
}

describe("spaziergangComposer", () => {
  it("prefers full journal body over stale context prefix for callout title", () => {
    expect(
      spaziergangCalloutTitle({
        body: "Spaziergang: Heidküppel (mit Hund) (test)",
        context: "Spaziergang:",
        time: "11:00",
        profile: "spaziergang",
      }),
    ).toBe("Spaziergang: Heidküppel (mit Hund) (test)");
  });

  it("prefers journal body over longer stale context for callout title", () => {
    expect(
      spaziergangCalloutTitle({
        body: "Spaziergang: Heidküppel",
        context: "Spaziergang: Ebersburg Gehen",
        time: "11:00",
        profile: "spaziergang",
      }),
    ).toBe("Spaziergang: Heidküppel");
  });

  it("parses spaziergang entry meta comment", () => {
    const meta = parseSpaziergangEntryMetaLine(
      '<!-- udn-spaziergang-entry: {"entryId":"s1","titel":"Park","kurz":"2 km","beschreibung":"Schön","trackPath":"Calendar/tracks/a.gpx","track":"a.gpx"} -->',
    );
    expect(meta?.entryId).toBe("s1");
    expect(meta?.titel).toBe("Park");
    expect(meta?.kurz).toBe("2 km");
  });

  it("parses spaziergang entry meta inside callout prefix", () => {
    const meta = parseSpaziergangEntryMetaLine(
      '> <!-- udn-spaziergang-entry: {"entryId":"knvh","titel":"Park","kurz":"","beschreibung":"Runde","trackPath":"Calendar/a.gpx","track":"a.gpx"} -->',
    );
    expect(meta?.entryId).toBe("knvh");
    expect(meta?.beschreibung).toBe("Runde");
  });

  it("loads supplements from prefixed meta in ## Spaziergang", () => {
    const loaded = parseSpaziergangSupplementsFromLines([
      "## Spaziergang",
      "",
      "> [!person-walking]+ Park",
      "> Beschreibungstext",
      '> <!-- udn-spaziergang-entry: {"entryId":"knvh","titel":"Park","kurz":"","beschreibung":"Beschreibungstext","trackPath":"Calendar/a.gpx","track":"a.gpx","fotos":[]} -->',
    ]);
    expect(loaded.supplements.get("knvh")?.beschreibung).toBe("Beschreibungstext");
    expect(loaded.supplements.get("knvh")?.trackPath).toBe("Calendar/a.gpx");
  });

  it("merges real vault-style spaziergang block into composer entry", () => {
    const noteLines = [
      "## Spaziergang",
      "",
      "> [!person-walking]+ Spaziergang: Parkrunde",
      ">",
      "> > [!blank|wide-60]",
      "> > Beschreibung aus dem Callout.",
      "> > ```udn-track-3d",
      "> > path: Calendar/Anhänge/GPX/Spaziergang Parkrunde.gpx",
      "> > ```",
      "> > [!blank-container|no-margin gallery gallery-row]",
      "> > ![[Calendar/Anhänge/Bilder/2026-06-14/foto1.jpg]] ![[Calendar/Anhänge/Bilder/2026-06-14/foto2.jpg]]",
      '> <!-- udn-spaziergang-entry: {"entryId":"knvh","titel":"Spaziergang: Parkrunde","kurz":"","beschreibung":"Beschreibung aus dem Callout.","trackPath":"Calendar/Anhänge/GPX/Spaziergang Parkrunde.gpx","track":"Spaziergang Parkrunde.gpx","fotos":["![[Calendar/Anhänge/Bilder/2026-06-14/foto1.jpg]]","![[Calendar/Anhänge/Bilder/2026-06-14/foto2.jpg]]"],"layout":"gallery-row"} -->',
    ];
    const loaded = parseSpaziergangSupplementsFromLines(noteLines);
    const merged = mergeSpaziergangSupplementsIntoEntries(
      [
        {
          id: "line-19",
          line: 19,
          time: "09:45",
          body: "Spaziergang: Parkrunde",
          rawLine:
            '> - 09:45 Spaziergang: Parkrunde <!-- udn-entry:{"id":"knvh","profile":"spaziergang","context":"Spaziergang: Parkrunde","callout":"knvh"} -->',
          entryId: "knvh",
          profile: "spaziergang",
          context: "Spaziergang: Parkrunde",
          calloutId: "knvh",
        },
      ],
      loaded,
    );
    expect(merged[0]?.supplementDetail).toContain("Beschreibung aus dem Callout");
    expect(merged[0]?.supplementTrackPath).toBe("Calendar/Anhänge/GPX/Spaziergang Parkrunde.gpx");
    expect(merged[0]?.supplementPhotos?.length).toBeGreaterThanOrEqual(2);
    expect(merged[0]?.calloutId).toBe("knvh");
  });

  it("renders photo collage without throwing when photos are present", async () => {
    const app = {
      vault: {
        getAbstractFileByPath: () => null,
      },
    } as unknown as App;

    const body = await renderSpaziergangSectionBody(app, [
      {
        entryId: "p1",
        time: "10:00",
        body: "Parkrunde",
        context: "Park",
        profile: "spaziergang",
        supplementDetail: "Mit Fotos",
        supplementPhotos: ["Calendar/Anhänge/Bilder/foto1.jpg"],
      },
    ], new Date("2026-07-05"), {
      template: "> [!person-walking]+ {{titel}}\n> {{beschreibung}}\n> {{fotos}}",
      photosFolder: "Calendar/Anhänge/Bilder",
      tracksFolder: "Calendar/Anhänge/GPX",
      maxPhotos: 3,
      track3dEnabled: false,
      track3dHeight: 200,
      track3dElevationExaggeration: 4,
    });
    const joined = body.join("\n");
    expect(joined).toContain("![[Calendar/Anhänge/Bilder/foto1.jpg]]");
    expect(joined).not.toContain("[object Object]");
    expect(joined).not.toMatch(/>\s*>\s*>\s*>\s*>\s*>\s*\[!blank-container/);
  });

  it("renders callouts in time order", async () => {
    const body = await renderSpaziergangSectionBody({} as App, [
      {
        entryId: "b2",
        time: "18:00",
        body: "Abendrunde",
        context: "Abend",
        profile: "spaziergang",
        supplementKurz: "Spät",
        supplementDetail: "Abends",
      },
      {
        entryId: "a1",
        time: "10:00",
        body: "Morgenrunde",
        context: "Morgen",
        profile: "spaziergang",
        supplementKurz: "Früh",
        supplementDetail: "Morgens",
      },
    ], new Date("2026-07-03"), {
      template: "> [!person-walking]+ {{titel}}\n> {{kurz}}\n> {{beschreibung}}",
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

  it("removes orphan spaziergang callouts on sync", async () => {
    let disk = [
      "## Tagebuch",
      "",
      "> [!tagebuch-ref] 03.07.2026",
      '> - 10:00 Runde <!-- udn-entry:{"id":"keep","profile":"spaziergang","context":"Alt"} -->',
      "",
      "## Spaziergang",
      "",
      "> [!person-walking]+ Verwaist",
      "> alt",
      spaziergangEntryMetaComment({
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
        body: "Runde",
        rawLine: "",
        entryId: "keep",
        profile: "spaziergang",
        context: "Neu",
        supplementKurz: "Neu Kurz",
        supplementDetail: "Neu Detail",
      },
    ];

    await syncSpaziergangSupplements(app, mockFile("2026-07-03.md"), entries, new Date("2026-07-03"), {
      template: "> [!person-walking]+ {{titel}}\n> {{kurz}}\n> {{beschreibung}}",
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

  it("does not create Spaziergang section when no spaziergang entries", async () => {
    let disk = [
      "## Tagebuch",
      "",
      "> [!tagebuch-ref] 03.07.2026",
      "> - 10:00 Aufstehen",
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

    await syncSpaziergangSupplements(app, mockFile("2026-07-03.md"), [
      {
        id: "line-1",
        line: 1,
        time: "10:00",
        body: "Aufstehen",
        rawLine: "- 10:00 Aufstehen",
        profile: "tagebuch",
      },
    ], new Date("2026-07-03"), {
      template: "> [!person-walking]+ {{titel}}\n> {{kurz}}\n> {{beschreibung}}",
      photosFolder: "Calendar/Anhänge/Bilder",
      tracksFolder: "Calendar/Anhänge/GPX",
      maxPhotos: 3,
      track3dEnabled: false,
      track3dHeight: 200,
      track3dElevationExaggeration: 4,
    });

    expect(disk).not.toContain("## Spaziergang");
  });

  it("removes empty Spaziergang section when entries are gone", async () => {
    let disk = [
      "## Tagebuch",
      "",
      "> [!tagebuch-ref] 03.07.2026",
      "> - 10:00 Aufstehen",
      "",
      "## Spaziergang",
      "",
      "> [!person-walking]+ Alt",
      "> alt",
      spaziergangEntryMetaComment({
        entryId: "old",
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

    await syncSpaziergangSupplements(app, mockFile("2026-07-03.md"), [
      {
        id: "line-1",
        line: 1,
        time: "10:00",
        body: "Aufstehen",
        rawLine: "- 10:00 Aufstehen",
        profile: "tagebuch",
      },
    ], new Date("2026-07-03"), {
      template: "> [!person-walking]+ {{titel}}\n> {{kurz}}\n> {{beschreibung}}",
      photosFolder: "Calendar/Anhänge/Bilder",
      tracksFolder: "Calendar/Anhänge/GPX",
      maxPhotos: 3,
      track3dEnabled: false,
      track3dHeight: 200,
      track3dElevationExaggeration: 4,
    });

    expect(disk).not.toContain("## Spaziergang");
    expect(disk).not.toContain("Alt");
  });
});

