import { describe, expect, it } from "vitest";
import {
  buildComposerCalloutBlock,
  formatComposerCalloutTitle,
  formatComposerCalloutType,
  isLegacyMisplacedSonstigesTripCallout,
  isManagedCalloutStart,
  isPlainJournalBulletLine,
  isReisenTripCalloutLine,
} from "./journalCallout";

describe("journalCallout", () => {
  it("uses date title for Tagebuch", () => {
    const date = new Date(2026, 5, 23);
    expect(formatComposerCalloutTitle("Tagebuch", date)).toBe("23.06.2026");
    expect(formatComposerCalloutType("Tagebuch")).toBe("tagebuch-ref");
  });

  it("uses heading as title for other sections", () => {
    expect(formatComposerCalloutTitle("Reisen", undefined, "Mamas 90ter Geburtstag")).toBe(
      "Reisen [Mamas 90ter Geburtstag]",
    );
    expect(formatComposerCalloutTitle("Sonstiges")).toBe("Sonstiges");
    expect(formatComposerCalloutTitle("Aufgaben")).toBe("Aufgaben");
    expect(formatComposerCalloutType("Sonstiges")).toBe("notes");
    expect(formatComposerCalloutType("Reisen")).toBe("compass");
    expect(formatComposerCalloutType("Aufgaben")).toBe("todo");
  });

  it("builds callout block with quoted bullets", () => {
    const block = buildComposerCalloutBlock("Tagebuch", ["07:30 Aufstehen"], new Date(2026, 5, 23));
    expect(block).toEqual([
      "> [!tagebuch-ref] 23.06.2026",
      "> - 07:30 Aufstehen",
      "",
    ]);
  });

  it("detects managed callout starts including legacy types", () => {
    expect(isManagedCalloutStart("> [!tagebuch-ref] 23.06.2026", "Tagebuch")).toBe(true);
    expect(isManagedCalloutStart("> [!tagebuch] Tagebuch", "Tagebuch")).toBe(true);
    expect(isManagedCalloutStart("> [!weather]+ Wetter", "Tagebuch")).toBe(false);
    expect(isManagedCalloutStart("> [!compass] Reisen", "Reisen")).toBe(true);
    expect(isManagedCalloutStart("> [!reisen] Reisen", "Reisen")).toBe(true);
    expect(isManagedCalloutStart("> [!reisen] Reisen", "Tagebuch")).toBe(false);
  });

  it("ignores task bullets", () => {
    expect(isPlainJournalBulletLine("- [ ] Task")).toBe(false);
    expect(isPlainJournalBulletLine("> - 07:30 Aufstehen")).toBe(true);
  });

  it("detects Reisen trip callouts only with explicit trip markers", () => {
    expect(isReisenTripCalloutLine("> [!compass] Reisen [Boxi]")).toBe(true);
    expect(isReisenTripCalloutLine("> [!notes] Reisen [Mamas 90ter Geburtstag]")).toBe(true);
    expect(isReisenTripCalloutLine("> [!notes] Mamas 90ter Geburtstag")).toBe(false);
    expect(isReisenTripCalloutLine("> [!notes] Big Things Today")).toBe(false);
  });

  it("detects legacy misplaced Sonstiges trip callouts", () => {
    expect(isLegacyMisplacedSonstigesTripCallout("> [!notes] Mamas 90ter Geburtstag")).toBe(true);
    expect(isLegacyMisplacedSonstigesTripCallout("> [!notes] Sonstiges")).toBe(false);
    expect(isLegacyMisplacedSonstigesTripCallout("> [!notes] Big Things Today")).toBe(true);
  });
});
