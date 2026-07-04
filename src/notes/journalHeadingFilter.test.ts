import { describe, expect, it } from "vitest";
import {
  finalizeJournalHeadings,
  isExcludedJournalHeading,
  mergeOutlineFilterHeadings,
  normalizeActiveJournalHeading,
} from "./journalHeadingFilter";

describe("journalHeadingFilter", () => {
  it("excludes Aufgaben and Tasks", () => {
    expect(isExcludedJournalHeading("Aufgaben")).toBe(true);
    expect(isExcludedJournalHeading("Tasks")).toBe(true);
    expect(isExcludedJournalHeading("Tagebuch")).toBe(false);
  });

  it("sorts Tagebuch first and drops excluded headings", () => {
    expect(finalizeJournalHeadings(["Sonstiges", "Aufgaben", "Tagebuch", "Tasks"])).toEqual([
      "Tagebuch",
      "Sonstiges",
    ]);
  });

  it("falls back to Tagebuch when active heading is excluded", () => {
    expect(normalizeActiveJournalHeading("Aufgaben")).toBe("Tagebuch");
    expect(normalizeActiveJournalHeading("Sonstiges")).toBe("Sonstiges");
  });

  it("preserves Alle as active heading", () => {
    expect(normalizeActiveJournalHeading("Alle")).toBe("Alle");
  });

  it("mergeOutlineFilterHeadings always includes profile sections", () => {
    expect(mergeOutlineFilterHeadings(["Tagebuch", "Sonstiges"])).toEqual([
      "Tagebuch",
      "Heizung",
      "Lüftung",
      "Reisen",
      "Sonstiges",
      "Wandern",
    ]);
  });
});
