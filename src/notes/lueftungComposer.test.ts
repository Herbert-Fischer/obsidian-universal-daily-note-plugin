import { describe, expect, it } from "vitest";
import type { App, TFile } from "obsidian";
import {
  buildLueftungCalloutBlock,
  lueftungMetaComment,
  mergeLueftungSupplementsIntoEntries,
  parseLueftungMetaLine,
  parseLueftungSupplementsFromLines,
  renderLueftungSectionBody,
  syncLueftungSupplements,
} from "./lueftungComposer";
import type { ComposerEntry } from "./dailyComposer";

function mockFile(path: string): TFile {
  return { path } as TFile;
}

describe("lueftungComposer", () => {
  it("preserves markdown formatting in callout prose", () => {
    const detail = "**HAR:** OK\n\n- Filter geprüft\n- [[Lüftung]]";
    const block = buildLueftungCalloutBlock("Filterwechsel", detail);
    expect(block).toContain("> **HAR:** OK");
    expect(block).toContain(">");
    expect(block).toContain("> - Filter geprüft");
    expect(block).toContain("> - [[Lüftung]]");

    const loaded = parseLueftungSupplementsFromLines(["## Lüftung", "", ...block.split("\n"), lueftungMetaComment({
      entryId: "md1",
      wartung: "Kontrolle",
      detail,
    })]);
    expect(loaded.supplements.get("md1")?.detail).toBe(detail);
  });

  it("builds wind callout with prose", () => {
    const block = buildLueftungCalloutBlock("Filterwechsel", "Filter gewechselt.\nDichtung geprüft.");
    expect(block).toContain("[!wind]+ Filterwechsel");
    expect(block).toContain("> Filter gewechselt.");
    expect(block).toContain("> Dichtung geprüft.");
  });

  it("parses lueftung entry meta comment", () => {
    const meta = parseLueftungMetaLine(
      '<!-- udn-lueftung-entry: {"entryId":"l1","wartung":"Filterwechsel 2026","detail":"Text"} -->',
    );
    expect(meta?.entryId).toBe("l1");
    expect(meta?.wartung).toBe("Filterwechsel 2026");
  });

  it("renders callouts in time order without grouping", async () => {
    const body = await renderLueftungSectionBody({} as App, [
      {
        entryId: "b2",
        time: "18:00",
        body: "Abschluss",
        context: "Wartung B",
        profile: "lueftung",
        supplementDetail: "Abends",
      },
      {
        entryId: "a1",
        time: "10:00",
        body: "Start",
        context: "Wartung A",
        profile: "lueftung",
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
      "## Lüftung",
      "",
      "> [!wind]+ Filterwechsel",
      "> Detailtext",
      '<!-- udn-lueftung-entry: {"entryId":"x9","wartung":"Sommer 2026","detail":"Detailtext"} -->',
    ];
    const loaded = parseLueftungSupplementsFromLines(lines);
    const merged = mergeLueftungSupplementsIntoEntries(
      [
        {
          id: "line-1",
          line: 1,
          time: "10:00",
          body: "Filterwechsel",
          rawLine: "- 10:00 Filterwechsel",
          entryId: "x9",
          profile: "lueftung",
        },
      ],
      loaded,
    );
    expect(merged[0]?.supplementDetail).toBe("Detailtext");
    expect(merged[0]?.context).toBe("Sommer 2026");
    expect(merged[0]?.calloutId).toBe("x9");
  });

  it("roundtrips photos in lueftung callout", async () => {
    const app = {} as App;
    const body = await renderLueftungSectionBody(app, [
      {
        entryId: "p1",
        time: "10:00",
        body: "Filter kontrolliert",
        context: "Kontrolle",
        profile: "lueftung",
        supplementDetail: "HAR: OK",
        supplementPhotos: ["Atlas/test/01.jpg"],
      },
    ]);
    const joined = body.join("\n");
    expect(joined).toContain("> > [!blank-container|no-margin gallery gallery-row]");
    expect(joined).toContain("![[Atlas/test/01.jpg]]");
    expect(joined).toContain('"fotos"');

    const loaded = parseLueftungSupplementsFromLines(["## Lüftung", "", ...body]);
    expect(loaded.supplements.get("p1")?.photos).toContain("Atlas/test/01.jpg");
    expect(loaded.supplements.get("p1")?.detail).toBe("HAR: OK");
  });

  it("removes orphan lueftung callouts on sync", async () => {
    let disk = [
      "## Tagebuch",
      "",
      "> [!tagebuch-ref] 03.07.2026",
      '> - 10:00 Nur Tagebuch <!-- udn-entry:{"id":"keep","profile":"lueftung","context":"Alt"} -->',
      "",
      "## Lüftung",
      "",
      "> [!wind]+ Verwaist",
      "> alt",
      '<!-- udn-lueftung-entry: {"entryId":"orphan","wartung":"Alt","detail":"alt"} -->',
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
        profile: "lueftung",
        context: "Neu",
        supplementDetail: "Neu Detail",
      },
    ];

    await syncLueftungSupplements(app, mockFile("2026-07-03.md"), entries, new Date("2026-07-03"), {
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
