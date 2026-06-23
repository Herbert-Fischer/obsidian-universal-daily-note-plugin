import { describe, expect, it } from "vitest";
import { parseWikiLinks } from "./parseWikiLinks";

describe("parseWikiLinks", () => {
  it("parses simple wikilink", () => {
    expect(parseWikiLinks("Besuch [[Mona Buchmann]]")).toEqual([
      { kind: "text", value: "Besuch " },
      { kind: "link", dest: "Mona Buchmann", label: "Mona Buchmann" },
    ]);
  });

  it("parses alias and heading", () => {
    expect(parseWikiLinks("[[Page#Heading|Alias]]")).toEqual([
      { kind: "link", dest: "Page#Heading", label: "Alias" },
    ]);
  });

  it("returns plain text when no links", () => {
    expect(parseWikiLinks("07:10 Aufstehen")).toEqual([{ kind: "text", value: "07:10 Aufstehen" }]);
  });
});
