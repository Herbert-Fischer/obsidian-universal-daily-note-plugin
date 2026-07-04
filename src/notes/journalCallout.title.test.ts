import { describe, expect, it } from "vitest";
import {
  buildComposerCalloutBlock,
  formatManagedCalloutTitleLine,
  parseComposerCalloutTitle,
  readCalloutTitleFromLines,
} from "./journalCallout";

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

  it("reads fire callout title in Heizung section", () => {
    const lines = ["## Heizung", "> [!fire]+ Installation Wasserversorgung", ">"];
    expect(readCalloutTitleFromLines(lines, "Heizung")).toBe("Installation Wasserversorgung");
  });
});

describe("formatManagedCalloutTitleLine", () => {
  it("uses profile callout types with composer title", () => {
    expect(formatManagedCalloutTitleLine("Reisen", "Reisen [Sommer]")).toBe(
      "> [!compass]+ Reisen [Sommer]",
    );
    expect(formatManagedCalloutTitleLine("Heizung", "Wartung WP")).toBe("> [!fire]+ Wartung WP");
    expect(formatManagedCalloutTitleLine("Lüftung", "Filterwechsel")).toBe("> [!wind]+ Filterwechsel");
  });

  it("buildComposerCalloutBlock writes expanded profile callouts", () => {
    const block = buildComposerCalloutBlock("Reisen", ["10:00 Abfahrt"], undefined, null, "Reisen [Test]");
    expect(block[0]).toBe("> [!compass]+ Reisen [Test]");
  });
});
