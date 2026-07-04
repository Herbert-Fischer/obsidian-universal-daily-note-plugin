import { describe, expect, it } from "vitest";
import { collectGroupLabelsFromText, groupFieldLabel } from "./journalEntryGroups";

describe("journalEntryGroups", () => {
  it("labels group field by profile", () => {
    expect(groupFieldLabel("reisen")).toBe("Reise");
    expect(groupFieldLabel("heizung")).toBe("Vorfall");
  });

  it("collects group labels from udn-entry metadata", () => {
    const text = `
- 10:00 Abfahrt <!-- udn-entry:{"id":"a1","profile":"reisen","context":"Mamas 90ter"} -->
- 14:00 Ankunft <!-- udn-entry:{"id":"b2","profile":"reisen","context":"Mamas 90ter"} -->
`;
    expect(collectGroupLabelsFromText(text, "reisen")).toEqual(["Mamas 90ter"]);
  });
});
