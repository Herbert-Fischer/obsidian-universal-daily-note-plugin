import { describe, expect, it } from "vitest";
import type { App, TFile } from "obsidian";
import {
  buildReisenCalloutBlock,
  mergeReisenSupplementsIntoEntries,
  parseReisenMetaLine,
  parseReisenSupplementsFromLines,
  renderReisenSectionBody,
  syncReisenSupplements,
} from "./reisenComposer";
import type { ComposerEntry } from "./dailyComposer";

function mockFile(path: string): TFile {
  return { path } as TFile;
}

describe("reisenComposer", () => {
  it("builds compass callout with prose", () => {
    const block = buildReisenCalloutBlock("Abfahrt Hamburg", "Boxi beladen.\nLosfahrt.");
    expect(block).toContain("[!compass]+ Abfahrt Hamburg");
    expect(block).toContain("> Boxi beladen.");
    expect(block).toContain("> Losfahrt.");
    expect(block).not.toContain("> - ");
  });

  it("parses reisen meta comment", () => {
    const meta = parseReisenMetaLine(
      '<!-- udn-reisen: {"entryId":"a1b2","reise":"Mamas 90ter","detail":"Text"} -->',
    );
    expect(meta?.entryId).toBe("a1b2");
    expect(meta?.reise).toBe("Mamas 90ter");
  });

  it("sorts callouts within a reise by time descending", () => {
    const body = renderReisenSectionBody(
      [
        {
          entryId: "b2",
          time: "18:00",
          body: "Ankunft",
          context: "Trip A",
          profile: "reisen",
          supplementDetail: "Abends",
        },
        {
          entryId: "a1",
          time: "10:00",
          body: "Abfahrt",
          context: "Trip A",
          profile: "reisen",
          supplementDetail: "Morgens",
        },
      ],
      { "Trip A": "desc" },
    );
    const joined = body.join("\n");
    const abfahrt = joined.indexOf("Abfahrt");
    const ankunft = joined.indexOf("Ankunft");
    expect(abfahrt).toBeGreaterThan(-1);
    expect(ankunft).toBeGreaterThan(-1);
    expect(ankunft).toBeLessThan(abfahrt);
    expect(joined).toContain('"order":"desc"');
  });

  it("roundtrips supplements into composer entries", () => {
    const lines = [
      "## Reisen",
      "",
      "> [!compass]+ Abfahrt",
      "> Detailtext",
      '<!-- udn-reisen: {"entryId":"x9","reise":"Sommer","detail":"Detailtext"} -->',
    ];
    const loaded = parseReisenSupplementsFromLines(lines);
    const merged = mergeReisenSupplementsIntoEntries(
      [
        {
          id: "line-1",
          line: 1,
          time: "10:00",
          body: "Abfahrt",
          rawLine: "- 10:00 Abfahrt",
          entryId: "x9",
          profile: "reisen",
        },
      ],
      loaded,
    );
    expect(merged[0]?.supplementDetail).toBe("Detailtext");
    expect(merged[0]?.context).toBe("Sommer");
    expect(merged[0]?.calloutId).toBe("x9");
  });

  it("removes orphan reisen callouts on sync", async () => {
    let disk = [
      "## Tagebuch",
      "",
      "> [!tagebuch-ref] 03.07.2026",
      '> - 10:00 Nur Tagebuch <!-- udn-entry:{"id":"keep","profile":"reisen","context":"Alt"} -->',
      "",
      "## Reisen",
      "",
      "> [!compass]+ Verwaist",
      "> alt",
      '<!-- udn-reisen: {"entryId":"orphan","reise":"Alt","detail":"alt"} -->',
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
        profile: "reisen",
        context: "Neu",
        supplementDetail: "Neu Detail",
      },
    ];

    await syncReisenSupplements(app, mockFile("2026-07-03.md"), entries, {});
    expect(disk).toContain("Neu Detail");
    expect(disk).toContain('"entryId":"keep"');
    expect(disk).not.toContain("orphan");
    expect(disk).not.toContain("Verwaist");
  });

  it("includes wandern entries with reise assignment in ## Reisen", () => {
    const body = renderReisenSectionBody([
      {
        entryId: "knvh",
        time: "09:45",
        body: "Wandern: Bläsis Mühle",
        context: "Wandern: Bläsis Mühle",
        profile: "wandern",
        reiseAssignment: "Mamas 90ter Geburtstag",
        supplementDetail: "Rundweg mit Aussicht",
      },
    ]);
    const joined = body.join("\n");
    expect(joined).toContain("Bläsis Mühle");
    expect(joined).toContain('"reise":"Mamas 90ter Geburtstag"');
    expect(joined).toContain('"entryId":"knvh"');
    expect(joined).toContain("Rundweg mit Aussicht");
  });

  it("merges reise assignment into wandern composer entries", () => {
    const loaded = parseReisenSupplementsFromLines([
      "## Reisen",
      "",
      "> [!compass]+ Wandern: Bläsis Mühle",
      "> Kurz",
      '<!-- udn-reisen: {"entryId":"knvh","reise":"Mamas 90ter","detail":"Kurz"} -->',
    ]);
    const merged = mergeReisenSupplementsIntoEntries(
      [
        {
          id: "line-1",
          line: 1,
          time: "09:45",
          body: "Wandern: Bläsis Mühle",
          rawLine: "",
          entryId: "knvh",
          profile: "wandern",
          context: "Wandern: Bläsis Mühle",
        },
      ],
      loaded,
    );
    expect(merged[0]?.reiseAssignment).toBe("Mamas 90ter");
    expect(merged[0]?.supplementDetail).toBeUndefined();
  });
});
