import { describe, expect, it } from "vitest";
import { matchWikiLinkSuggestions, type WikiLinkFileInfo } from "./wikiLinkSuggestions";

const files: WikiLinkFileInfo[] = [
  { path: "Atlas/Immobilien/EFH Hettenhausen/EFH Hettenhausen.md", basename: "EFH Hettenhausen", aliases: [] },
  {
    path: "Atlas/Technologien/PV und Messstelle EFH Hettenhausen.md",
    basename: "PV und Messstelle EFH Hettenhausen",
    aliases: [],
  },
];

describe("matchWikiLinkSuggestions", () => {
  it("prefers exact basename over longer notes that only share a substring", () => {
    const results = matchWikiLinkSuggestions(files, "EFH Hettenhausen", 10);
    expect(results[0]?.basename).toBe("EFH Hettenhausen");
    expect(results.some((item) => item.basename === "PV und Messstelle EFH Hettenhausen")).toBe(false);
  });
});
