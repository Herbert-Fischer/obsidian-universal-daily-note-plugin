import { describe, expect, it } from "vitest";
import { matchWikiLinkSuggestions, parseWikiPartialQuery } from "./wikiLinkSuggestions";

const files = [
  { path: "People/Mona Buchmann.md", basename: "Mona Buchmann", aliases: ["Mona", "M. Buchmann"] },
  { path: "Notes/Daily Stuff.md", basename: "Daily Stuff", aliases: [] },
];

describe("parseWikiPartialQuery", () => {
  it("parses page search", () => {
    expect(parseWikiPartialQuery("Mona")).toEqual({
      page: "Mona",
      heading: undefined,
      aliasPart: undefined,
      search: "Mona",
      aliasMode: false,
    });
  });

  it("parses alias mode after pipe", () => {
    expect(parseWikiPartialQuery("Mona Buchmann|Mo")).toEqual({
      page: "Mona Buchmann",
      heading: undefined,
      aliasPart: "Mo",
      search: "Mo",
      aliasMode: true,
    });
  });
});

describe("matchWikiLinkSuggestions", () => {
  it("finds files by basename", () => {
    const hits = matchWikiLinkSuggestions(files, "Mona");
    expect(hits.map((h) => h.label)).toContain("Mona Buchmann");
  });

  it("finds files by alias", () => {
    const hits = matchWikiLinkSuggestions(files, "M. Buch");
    expect(hits.some((h) => h.alias === "M. Buchmann")).toBe(true);
  });

  it("lists aliases when pipe is open", () => {
    const hits = matchWikiLinkSuggestions(files, "Mona Buchmann|");
    expect(hits.map((h) => h.label)).toEqual(expect.arrayContaining(["Mona", "M. Buchmann"]));
  });

  it("inserts alias suggestion metadata", () => {
    const hits = matchWikiLinkSuggestions(files, "Mona");
    const aliasHit = hits.find((h) => h.alias === "Mona");
    expect(aliasHit).toMatchObject({
      filePath: "People/Mona Buchmann.md",
      alias: "Mona",
      label: "Mona",
      detail: "Mona Buchmann",
    });
  });
});
