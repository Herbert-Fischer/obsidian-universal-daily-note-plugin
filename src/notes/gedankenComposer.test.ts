import { describe, expect, it } from "vitest";
import type { App, TFile } from "obsidian";
import {
  buildGedankenCalloutBlock,
  gedankenMetaComment,
  mergeGedankenSupplementsIntoEntries,
  parseGedankenMetaLine,
  parseGedankenSupplementsFromLines,
  renderGedankenSectionBody,
  syncGedankenSupplements,
} from "./gedankenComposer";
import type { ComposerEntry } from "./dailyComposer";

function mockFile(path: string): TFile {
  return { path } as TFile;
}

describe("gedankenComposer", () => {
  it("builds lightbulb callout with prose", () => {
    const block = buildGedankenCalloutBlock("Plugin-Idee", "Könnte als Inbox dienen.");
    expect(block).toContain("[!lightbulb]+ Plugin-Idee");
    expect(block).toContain("> Könnte als Inbox dienen.");
  });

  it("parses gedanken entry meta comment", () => {
    const meta = parseGedankenMetaLine(
      '<!-- udn-gedanken-entry: {"entryId":"g1","thema":"Obsidian","detail":"Text"} -->',
    );
    expect(meta?.entryId).toBe("g1");
    expect(meta?.thema).toBe("Obsidian");
  });

  it("skips supplements without detail", () => {
    const body = renderGedankenSectionBody([
      {
        entryId: "a1",
        time: "10:00",
        body: "Kurz ohne Detail",
        context: "Allgemein",
        profile: "gedanken",
      },
      {
        entryId: "b2",
        time: "11:00",
        body: "Mit Detail",
        context: "Obsidian",
        profile: "gedanken",
        supplementDetail: "Ausarbeitung",
      },
    ]);
    const joined = body.join("\n");
    expect(joined).not.toContain("Kurz ohne Detail");
    expect(joined).toContain("Mit Detail");
    expect(joined).toContain("Ausarbeitung");
  });

  it("roundtrips supplements into composer entries", () => {
    const lines = [
      "## Gedanken",
      "",
      "> [!lightbulb]+ Plugin-Idee",
      "> Detailtext",
      '<!-- udn-gedanken-entry: {"entryId":"x9","thema":"Obsidian","detail":"Detailtext"} -->',
    ];
    const loaded = parseGedankenSupplementsFromLines(lines);
    const merged = mergeGedankenSupplementsIntoEntries(
      [
        {
          id: "line-1",
          line: 1,
          time: "10:00",
          body: "Plugin-Idee",
          rawLine: "- 10:00 Plugin-Idee",
          entryId: "x9",
          profile: "gedanken",
        },
      ],
      loaded,
    );
    expect(merged[0]?.supplementDetail).toBe("Detailtext");
    expect(merged[0]?.context).toBe("Obsidian");
  });

  it("syncs ## Gedanken section from composer entries", async () => {
    let disk = [
      "## Tagebuch",
      "",
      "> [!tagebuch-ref] 05.07.2026",
      ">",
      "> - 10:00 Plugin-Idee",
      '> <!-- udn-entry:{"id":"x9","profile":"gedanken","context":"Obsidian","callout":"x9"} -->',
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
        read: async () => disk,
        modify: async (_file: TFile, content: string) => {
          disk = content;
        },
      },
    } as unknown as App;

    const entries: ComposerEntry[] = [
      {
        id: "line-1",
        line: 1,
        time: "10:00",
        body: "Plugin-Idee",
        rawLine: "- 10:00 Plugin-Idee",
        entryId: "x9",
        profile: "gedanken",
        context: "Obsidian",
        supplementDetail: "Inbox für flüchtige Captures",
      },
    ];

    await syncGedankenSupplements(app, mockFile("2026-07-05.md"), entries);
    expect(disk).toContain("## Gedanken");
    expect(disk).toContain("[!lightbulb]+ Plugin-Idee");
    expect(disk).toContain("Inbox für flüchtige Captures");
    expect(disk).toContain(
      gedankenMetaComment({
        entryId: "x9",
        thema: "Obsidian",
        detail: "Inbox für flüchtige Captures",
      }).trim(),
    );
  });
});
