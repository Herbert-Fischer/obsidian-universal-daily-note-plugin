import { describe, expect, it } from "vitest";
import { parseComposerCalloutTitle, readCalloutTitleFromLines } from "./journalCallout";

describe("parseComposerCalloutTitle", () => {
  it("reads title after fold marker", () => {
    expect(parseComposerCalloutTitle("> [!mountain]+ Wandern: Bläsis Mühle")).toBe(
      "Wandern: Bläsis Mühle",
    );
  });

  it("reads title from pipe syntax", () => {
    expect(parseComposerCalloutTitle("> [!mountain| Wandern: Test]")).toBe("Wandern: Test");
  });

  it("reads classic bracket title", () => {
    expect(parseComposerCalloutTitle("> [!compass] Reisen [Trip]")).toBe("Reisen [Trip]");
  });
});

describe("readCalloutTitleFromLines", () => {
  it("reads mountain callout title in Wandern section", () => {
    const lines = [
      "## Wandern",
      "> [!mountain]+ Wandern: Bläsis Mühle",
      ">",
    ];
    expect(readCalloutTitleFromLines(lines, "Wandern")).toBe("Wandern: Bläsis Mühle");
  });
});
