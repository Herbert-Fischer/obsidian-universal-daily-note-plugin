import { describe, expect, it } from "vitest";
import { TFile, parseFrontMatterAliases, type App } from "obsidian";
import {
  buildVaultLinkIndex,
  fileLinkPriority,
  formatTerminProseWithTrailingLinks,
  isLikelyStubPath,
  isUnresolvedWikiLink,
  resolveWikiLinkMarkdown,
  resolveWikiLinksInText,
  splitTrailingWikiLinkBlock,
  upgradeJournalEntryTextsLinks,
} from "./resolveWikiLinks";

function mockApp(files: { path: string; basename: string; aliases?: string[] }[], linkDest: Record<string, string>): App {
  const markdownFiles = files.map((f) => new TFile(f.path, f.basename));
  const byPath = new Map(markdownFiles.map((f) => [f.path, f]));

  return {
    vault: {
      getMarkdownFiles: () => markdownFiles,
    },
    metadataCache: {
      getFileCache: (file: TFile) => ({
        frontmatter: file.basename.includes("Biohotel")
          ? { aliases: ["Lindengut (Unsr Garten)", "LindenGut"] }
          : file.basename === "Mona Buchmann"
            ? { aliases: ["Mona"] }
            : file.basename === "Hermann Fien"
              ? { aliases: ["Hermann"] }
              : {},
      }),
      getFirstLinkpathDest: (linkpath: string) => {
        const target = linkDest[linkpath.trim().toLowerCase()];
        if (!target) return null;
        return byPath.get(target) ?? null;
      },
    },
  } as unknown as App;
}

describe("resolveWikiLinks", () => {
  it("prefers Atlas paths over +/ stubs", () => {
    expect(fileLinkPriority("+/Lindengut.md")).toBeLessThan(fileLinkPriority("Atlas/Organisationen/Biohotel Lindengut/Biohotel Lindengut.md"));
    expect(isLikelyStubPath("+/Lindengut.md")).toBe(true);
  });

  it("resolves Lindengut to Biohotel note when stub exists", () => {
    const app = mockApp(
      [
        { path: "+/Lindengut.md", basename: "Lindengut" },
        { path: "Atlas/Organisationen/Biohotel Lindengut/Biohotel Lindengut.md", basename: "Biohotel Lindengut" },
      ],
      { lindengut: "+/Lindengut.md" },
    );
    const index = buildVaultLinkIndex(app);
    const resolved = resolveWikiLinkMarkdown(app, "Lindengut", undefined, undefined, "Calendar/Notes/2026-07-03.md", index);
    expect(resolved).toBe("[[Biohotel Lindengut|Lindengut]]");
  });

  it("resolves alias Mona to prose + trailing link", () => {
    const app = mockApp(
      [{ path: "Atlas/Menschen/Mona Buchmann/Mona Buchmann.md", basename: "Mona Buchmann" }],
      {},
    );
    const out = formatTerminProseWithTrailingLinks(app, "mit [[Mona]]", "Calendar/Notes/2026-07-03.md");
    expect(out).toBe("mit Mona   [[Mona Buchmann|Mona]]");
  });

  it("formats full caldav termin with prose and trailing links", () => {
    const app = mockApp(
      [
        { path: "+/Lindengut.md", basename: "Lindengut" },
        { path: "Atlas/Organisationen/Biohotel Lindengut/Biohotel Lindengut.md", basename: "Biohotel Lindengut" },
        { path: "Atlas/Menschen/Mona Buchmann/Mona Buchmann.md", basename: "Mona Buchmann" },
        { path: "Atlas/Menschen/Hermann Fien/Hermann Fien.md", basename: "Hermann Fien" },
      ],
      { lindengut: "+/Lindengut.md" },
    );
    const out = formatTerminProseWithTrailingLinks(
      app,
      "[[Lindengut]] mit [[Mona]] & [[Hermann]]",
      "Calendar/Notes/2026-07-03.md",
    );
    expect(out).toBe(
      "Lindengut mit Mona & Hermann   [[Biohotel Lindengut|Lindengut]] [[Mona Buchmann|Mona]] [[Hermann Fien|Hermann]]",
    );
  });

  it("is idempotent when trailing links already exist", () => {
    const app = mockApp(
      [
        { path: "Atlas/Organisationen/Biohotel Lindengut/Biohotel Lindengut.md", basename: "Biohotel Lindengut" },
        { path: "Atlas/Menschen/Mona Buchmann/Mona Buchmann.md", basename: "Mona Buchmann" },
      ],
      {},
    );
    const formatted =
      "Lindengut mit Mona   [[Biohotel Lindengut|Lindengut]] [[Mona Buchmann|Mona]]";
    expect(formatTerminProseWithTrailingLinks(app, formatted, "note.md")).toBe(formatted);
  });

  it("splitTrailingWikiLinkBlock separates prose and links", () => {
    const split = splitTrailingWikiLinkBlock(
      "Lindengut mit Mona   [[Biohotel Lindengut|Lindengut]] [[Mona Buchmann|Mona]]",
    );
    expect(split.leading).toBe("Lindengut mit Mona");
    expect(split.trailing).toEqual(["[[Biohotel Lindengut|Lindengut]]", "[[Mona Buchmann|Mona]]"]);
  });

  it("marks unresolved links", () => {
    const app = mockApp([], {});
    expect(isUnresolvedWikiLink(app, "Fehlt", "note.md")).toBe(true);
  });

  it("upgrades calendar termin line with bare wiki links", () => {
    const app = mockApp(
      [
        { path: "+/Lindengut.md", basename: "Lindengut" },
        { path: "Atlas/Organisationen/Biohotel Lindengut/Biohotel Lindengut.md", basename: "Biohotel Lindengut" },
        { path: "Atlas/Menschen/Mona Buchmann/Mona Buchmann.md", basename: "Mona Buchmann" },
        { path: "Atlas/Menschen/Hermann Fien/Hermann Fien.md", basename: "Hermann Fien" },
      ],
      { lindengut: "+/Lindengut.md" },
    );
    const input = [
      "13:30 Termin: [[Lindengut]] mit [[Mona]] & [[Hermann]] <!-- udn-cal:evt-1 -->",
    ];
    const out = upgradeJournalEntryTextsLinks(app, input, "Calendar/Notes/2026-07-03.md");
    expect(out[0]).toContain("Termin: Lindengut mit Mona & Hermann   ");
    expect(out[0]).toContain("[[Biohotel Lindengut|Lindengut]]");
    expect(out[0]).toContain("[[Mona Buchmann|Mona]]");
    expect(out[0]).toContain("[[Hermann Fien|Hermann]]");
    expect(out[0]).not.toMatch(/Termin:.*\[\[Lindengut\]\]/);
  });

  it("keeps short link for exact basename when a longer note also contains the query", () => {
    const app = mockApp(
      [
        { path: "Atlas/Immobilien/EFH Hettenhausen/EFH Hettenhausen.md", basename: "EFH Hettenhausen" },
        {
          path: "Atlas/Technologien/PV und Messstelle EFH Hettenhausen.md",
          basename: "PV und Messstelle EFH Hettenhausen",
        },
      ],
      { "efh hettenhausen": "Atlas/Immobilien/EFH Hettenhausen/EFH Hettenhausen.md" },
    );
    const index = buildVaultLinkIndex(app);
    const resolved = resolveWikiLinkMarkdown(
      app,
      "EFH Hettenhausen",
      undefined,
      undefined,
      "Calendar/Notes/2026-07-04.md",
      index,
    );
    expect(resolved).toBe("[[EFH Hettenhausen]]");
    expect(
      resolveWikiLinksInText(app, "Filter [[EFH Hettenhausen]]", "Calendar/Notes/2026-07-04.md", index),
    ).toBe("Filter [[EFH Hettenhausen]]");
    expect(isUnresolvedWikiLink(app, "EFH Hettenhausen", "Calendar/Notes/2026-07-04.md")).toBe(false);
  });

  it("preserves udn-entry metadata when upgrading links", () => {
    const app = mockApp(
      [
        { path: "Atlas/Menschen/Hermann Fien/Hermann Fien.md", basename: "Hermann Fien" },
      ],
      {},
    );
    const input = [
      '17:10 Sternentag [[Hermann Fien|Hermann]] <!-- udn-entry:{"id":"4lpq","profile":"reisen","context":"testreise","callout":"4lpq"} -->',
    ];
    const out = upgradeJournalEntryTextsLinks(app, input, "Calendar/Notes/2026-07-03.md");
    expect(out[0]).toContain("udn-entry");
    expect(out[0]).toContain('"profile":"reisen"');
    expect(out[0]).toContain('"id":"4lpq"');
  });
});

describe("parseFrontMatterAliases usage", () => {
  it("reads aliases from frontmatter", () => {
    expect(parseFrontMatterAliases({ aliases: ["Mona"] })).toEqual(["Mona"]);
  });
});
