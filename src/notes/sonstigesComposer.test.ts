import { describe, expect, it } from "vitest";
import { buildSonstigesCalloutBlock, parseSonstigesMetaLine, saveSonstigesComposerState } from "./sonstigesComposer";
import type { App, TFile } from "obsidian";

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

  it("writes Sonstiges callout and Tagebuch feed line", async () => {
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
