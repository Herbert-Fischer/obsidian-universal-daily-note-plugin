import { describe, expect, it } from "vitest";
import {
  buildComposerCalloutBlock,
  formatReisenCalloutTitle,
  parseReisenTripLabel,
} from "./journalCallout";

describe("Reisen trip callout titles", () => {
  it("parses legacy custom trip title", () => {
    expect(parseReisenTripLabel("> [!notes] Mamas 90ter Geburtstag")).toBe("Mamas 90ter Geburtstag");
  });

  it("formats single trip bracket", () => {
    expect(formatReisenCalloutTitle("Mamas 90ter Geburtstag")).toBe(
      "Reisen [Mamas 90ter Geburtstag]",
    );
  });

  it("preserves trip when saving callout", () => {
    const block = buildComposerCalloutBlock(
      "Reisen",
      ["[[Boxi]]tour Tag 3.1: **Wimsen** Besuch"],
      undefined,
      "Mamas 90ter Geburtstag",
    );
    expect(block[0]).toBe("> [!compass] Reisen [Mamas 90ter Geburtstag]");
  });

  it("uses explicit callout title override", () => {
    const block = buildComposerCalloutBlock(
      "Reisen",
      ["Tag 1"],
      undefined,
      null,
      "Mamas 90ter Geburtstag",
    );
    expect(block[0]).toBe("> [!compass] Mamas 90ter Geburtstag");
  });

  it("ignores multiple destination brackets", () => {
    expect(parseReisenTripLabel("> [!compass] Reisen [Ottobeuren] [Wimsen]")).toBeNull();
  });
});
