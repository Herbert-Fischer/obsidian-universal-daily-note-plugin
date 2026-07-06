import { describe, expect, it } from "vitest";
import type { App, TFile } from "obsidian";
import {
  buildHeizungCalloutBlock,
  heizungMetaComment,
  mergeHeizungSupplementsIntoEntries,
  parseHeizungMetaLine,
  parseHeizungSupplementsFromLines,
  renderHeizungSectionBody,
  syncHeizungSupplements,
} from "./heizungComposer";
import type { ComposerEntry } from "./dailyComposer";

function mockFile(path: string): TFile {
  return { path } as TFile;
}

describe("heizungComposer", () => {
  it("preserves markdown formatting in callout prose", () => {
    const detail = "**Störung:** Brenner\n\n- Temperatur geprüft\n- [[Heizung]]";
    const block = buildHeizungCalloutBlock("Brennerausfall", detail);
    expect(block).toContain("> **Störung:** Brenner");
    expect(block).toContain("> - Temperatur geprüft");
    expect(block).toContain("> - [[Heizung]]");

    const loaded = parseHeizungSupplementsFromLines(["## Heizung", "", ...block.split("\n"), heizungMetaComment({
      entryId: "md1",
      vorfall: "Brennerausfall",
      detail,
    })]);
    expect(loaded.supplements.get("md1")?.detail).toBe(detail);
  });

  it("builds fire callout with prose", () => {
    const block = buildHeizungCalloutBlock("Brennerausfall", "Brenner neu gestartet.\nDruck geprüft.");
    expect(block).toContain("[!fire]+ Brennerausfall");
    expect(block).toContain("> Brenner neu gestartet.");
    expect(block).toContain("> Druck geprüft.");
  });

  it("parses heizung entry meta comment", () => {
    const meta = parseHeizungMetaLine(
      '<!-- udn-heizung-entry: {"entryId":"h1","vorfall":"Brennerausfall","detail":"Text"} -->',
    );
    expect(meta?.entryId).toBe("h1");
    expect(meta?.vorfall).toBe("Brennerausfall");
  });

  it("renders callouts in time order without grouping", async () => {
    const body = await renderHeizungSectionBody({} as App, [
      {
        entryId: "b2",
        time: "18:00",
        body: "Abschluss",
        context: "Vorfall B",
        profile: "heizung",
        supplementDetail: "Abends",
      },
      {
        entryId: "a1",
        time: "10:00",
        body: "Start",
        context: "Vorfall A",
        profile: "heizung",
        supplementDetail: "Morgens",
      },
    ]);
    const joined = body.join("\n");
    const start = joined.indexOf("Start");
    const end = joined.indexOf("Abschluss");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(-1);
    expect(start).toBeLessThan(end);
  });

  it("roundtrips supplements into composer entries", () => {
    const lines = [
      "## Heizung",
      "",
      "> [!fire]+ Brennerausfall",
      "> Detailtext",
      '<!-- udn-heizung-entry: {"entryId":"x9","vorfall":"Mai 2026","detail":"Detailtext"} -->',
    ];
    const loaded = parseHeizungSupplementsFromLines(lines);
    const merged = mergeHeizungSupplementsIntoEntries(
      [
        {
          id: "line-1",
          line: 1,
          time: "10:00",
          body: "Brennerausfall",
          rawLine: "- 10:00 Brennerausfall",
          entryId: "x9",
          profile: "heizung",
        },
      ],
      loaded,
    );
    expect(merged[0]?.supplementDetail).toBe("Detailtext");
    expect(merged[0]?.context).toBe("Mai 2026");
    expect(merged[0]?.calloutId).toBe("x9");
  });

  it("roundtrips photos in heizung callout", async () => {
    const app = {} as App;
    const body = await renderHeizungSectionBody(app, [
      {
        entryId: "p1",
        time: "10:00",
        body: "Brenner geprüft",
        context: "Störung",
        profile: "heizung",
        supplementDetail: "Druck OK",
        supplementPhotos: ["Atlas/test/01.jpg"],
      },
    ]);
    const joined = body.join("\n");
    expect(joined).toContain("> > [!blank-container|no-margin gallery gallery-row]");
    expect(joined).toContain("![[Atlas/test/01.jpg]]");
    expect(joined).toContain('"fotos"');

    const loaded = parseHeizungSupplementsFromLines(["## Heizung", "", ...body]);
    expect(loaded.supplements.get("p1")?.photos).toContain("Atlas/test/01.jpg");
    expect(loaded.supplements.get("p1")?.detail).toBe("Druck OK");
  });

  it("removes orphan heizung callouts on sync", async () => {
    let disk = [
      "## Tagebuch",
      "",
      "> [!tagebuch-ref] 03.07.2026",
      '> - 10:00 Nur Tagebuch <!-- udn-entry:{"id":"keep","profile":"heizung","context":"Alt"} -->',
      "",
      "## Heizung",
      "",
      "> [!fire]+ Verwaist",
      "> alt",
      '<!-- udn-heizung-entry: {"entryId":"orphan","vorfall":"Alt","detail":"alt"} -->',
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
        body: "Nur Tagebuch",
        rawLine: "",
        entryId: "keep",
        profile: "heizung",
        context: "Neu",
        supplementDetail: "Neu Detail",
      },
    ];

    await syncHeizungSupplements(app, mockFile("2026-07-03.md"), entries, new Date("2026-07-03"), {
      heizungPhotosFolder: "Calendar/Anhänge/Bilder",
      lueftungPhotosFolder: "Calendar/Anhänge/Bilder",
      maxPhotos: 6,
    });
    expect(disk).toContain("Neu Detail");
    expect(disk).toContain('"entryId":"keep"');
    expect(disk).not.toContain("orphan");
    expect(disk).not.toContain("Verwaist");
  });
});
