import { describe, expect, it } from "vitest";
import { mergeGroupLabelSuggestions } from "./journalEntryGroups";

describe("mergeGroupLabelSuggestions", () => {
  it("merges extra labels and hides blocked names", () => {
    const out = mergeGroupLabelSuggestions(
      ["Mamas 90ter Geburtstag", "Erbach"],
      { extra: ["Sommer 2026"], hidden: ["Mamas 90ter Geburtstag"] },
    );
    expect(out).toContain("Erbach");
    expect(out).toContain("Sommer 2026");
    expect(out).not.toContain("Mamas 90ter Geburtstag");
  });
});
