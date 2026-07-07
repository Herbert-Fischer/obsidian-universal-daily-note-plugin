import { describe, expect, it } from "vitest";
import {
  buildSonstigesCalloutBlock,
  mergeSonstigesSupplementsIntoEntries,
  parseSonstigesEntryMetaLine,
  parseSonstigesMetaLine,
  parseSonstigesSupplementsFromLines,
  renderSonstigesSectionBody,
  saveSonstigesComposerState,
  sonstigesCalloutTitle,
  syncSonstigesSupplements,
} from "./sonstigesComposer";
import type { App, TFile } from "obsidian";
import type { ComposerEntry } from "./dailyComposer";

function mockFile(path: string): TFile {
  return { path } as TFile;
}

describe("sonstigesComposer", () => {
  it("builds prose callout without bullets", () => {
    const block = buildSonstigesCalloutBlock("Lilien von Otto", "Otto hat Lilien mitgebracht.\nZwei Bunde.");
    expect(block).toContain("[!notes] Lilien von Otto");
    expect(block).toContain("> Otto hat Lilien mitgebracht.");
    expect(block).toContain("> Zwei Bunde.");
    expect(block).not.toContain("> - ");
  });

  it("parses entry meta comment", () => {
    const meta = parseSonstigesEntryMetaLine(
      '<!-- udn-sonstiges-entry: {"entryId":"s1","titel":"Lilien","detail":"Text"} -->',
    );
    expect(meta?.entryId).toBe("s1");
    expect(meta?.titel).toBe("Lilien");
  });

  it("parses meta comment inside callout prefix", () => {
    const meta = parseSonstigesMetaLine(
      '> <!-- udn-sonstiges: {"titel":"Lilien","detail":"Text","feedTime":"23:04","feedKurz":"Lilien"} -->',
    );
    expect(meta?.titel).toBe("Lilien");
    expect(meta?.feedTime).toBe("23:04");
  });

  it("parses meta comment", () => {
    const meta = parseSonstigesMetaLine(
      '<!-- udn-sonstiges: {"titel":"Test","detail":"Text","feedTime":"23:04","feedKurz":"Test"} -->',
    );
    expect(meta?.titel).toBe("Test");
    expect(meta?.feedTime).toBe("23:04");
  });

  it("uses tagebuch entry text as callout title", () => {
    expect(
      sonstigesCalloutTitle({
        entryId: "x1",
        time: "10:00",
        body: "Lilien von Otto",
        context: "Anderer Titel",
        profile: "sonstiges",
      }),
    ).toBe("Lilien von Otto");
  });

  it("skips supplements without detail", () => {
    const body = renderSonstigesSectionBody([
      {
        entryId: "a1",
        time: "10:00",
        body: "Kurz ohne Detail",
        profile: "sonstiges",
      },
      {
        entryId: "b2",
        time: "11:00",
        body: "Mit Detail",
        profile: "sonstiges",
        supplementDetail: "Ausarbeitung",
      },
    ]);
    const joined = body.join("\n");
    expect(joined).not.toContain("Kurz ohne Detail");
    expect(joined).toContain("[!notes] Mit Detail");
    expect(joined).toContain("Ausarbeitung");
  });

  it("roundtrips supplements into composer entries", () => {
    const lines = [
      "## Sonstiges",
      "",
      "> [!notes] Lilien von Otto",
      "> Detailtext",
      '<!-- udn-sonstiges-entry: {"entryId":"x9","titel":"Lilien von Otto","detail":"Detailtext"} -->',
    ];
    const loaded = parseSonstigesSupplementsFromLines(lines);
    const merged = mergeSonstigesSupplementsIntoEntries(
      [
        {
          id: "line-1",
          line: 1,
          time: "10:00",
          body: "Lilien",
          rawLine: "- 10:00 Lilien",
          entryId: "x9",
          profile: "sonstiges",
        },
      ],
      loaded,
    );
    expect(merged[0]?.supplementDetail).toBe("Detailtext");
    expect(merged[0]?.context).toBeUndefined();
  });

  it("syncs supplements to Sonstiges section", async () => {
    let disk = [
      "---",
      "---",
      "",
      "## Tagebuch",
      "> - 10:00 Lilien <!-- udn-entry:{\"entryId\":\"x9\",\"profile\":\"sonstiges\"} -->",
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

    const file = mockFile("Calendar/Notes/2026-07-02.md");
    const entries: ComposerEntry[] = [
      {
        id: "line-1",
        line: 1,
        time: "10:00",
        body: "Lilien",
        rawLine: "- 10:00 Lilien",
        entryId: "x9",
        profile: "sonstiges",
        supplementDetail: "Otto brachte zwei Bunde mit.",
      },
    ];
    await syncSonstigesSupplements(app, file, entries);

    expect(disk).toContain("## Sonstiges");
    expect(disk).toContain("[!notes] Lilien");
    expect(disk).toContain("> Otto brachte zwei Bunde mit.");
    expect(disk).toContain("<!-- udn-sonstiges-entry:");
  });

  it("writes Sonstiges callout and Tagebuch feed line (legacy)", async () => {
    let disk = [
      "---",
      "Zusammenfassung:",
      "---",
      "",
      "## Tagebuch",
      "",
      "> [!tagebuch-ref] 02.07.2026",
      "> - 07:05 Aufstehen",
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

    const file = mockFile("Calendar/Notes/2026-07-02.md");
    await saveSonstigesComposerState(
      app,
      file,
      "Zusammenfassung Test",
      new Date(2026, 6, 2),
      {
        calloutTitle: "Lilien von Otto",
        detail: "Otto brachte zwei Bunde mit.",
        feedKurz: "",
        feedTime: "23:04",
      },
      "23:04",
    );

    expect(disk).toContain("## Sonstiges");
    expect(disk).toContain("[!notes] Lilien von Otto");
    expect(disk).toContain("> Otto brachte zwei Bunde mit.");
    expect(disk).toContain("<!-- udn-sonstiges:");
    expect(disk).toContain("> - 23:04 Lilien von Otto");
    expect(disk).toContain("Zusammenfassung: Zusammenfassung Test");
  });
});
