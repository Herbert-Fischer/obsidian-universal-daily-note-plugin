import { describe, expect, it } from "vitest";
import { displayWikiLinkSegments, feedSourceBadge } from "./feedEntryDisplay";

describe("displayWikiLinkSegments", () => {
  it("keeps inline wiki links at their position in the sentence", () => {
    const segments = displayWikiLinkSegments("Besuch bei: [[Heidi]] & [[Nobbi]] in der Wohnung");
    expect(segments.map((s) => (s.kind === "link" ? s.label : s.value))).toEqual([
      "Besuch bei: ",
      "Heidi",
      " & ",
      "Nobbi",
      " in der Wohnung",
    ]);
  });

  it("unwraps parenthesized suffix links for inline display", () => {
    const segments = displayWikiLinkSegments("Warmwasser ([[Heizungs-Tagebuch]])");
    expect(segments.map((s) => (s.kind === "link" ? s.label : s.value))).toEqual([
      "Warmwasser ",
      "Heizungs-Tagebuch",
    ]);
  });
});

describe("feedSourceBadge", () => {
  it("returns null for plain tagebuch entries", () => {
    expect(feedSourceBadge("tagebuch")).toBeNull();
    expect(feedSourceBadge(undefined)).toBeNull();
  });

  it("shows Sonstiges badge for legacy tagebuch profile with context", () => {
    expect(feedSourceBadge("tagebuch", "Lilien von Otto")).toEqual({
      label: "Sonstiges",
      className: "udn-feedLinkBubble--sonstiges",
      title: "Lilien von Otto",
    });
  });

  it("shows profile badge for feed-sourced entries", () => {
    expect(feedSourceBadge("wandern", "Wandern: Bläsis Mühle")).toEqual({
      label: "Wandern",
      className: "udn-feedLinkBubble--wandern",
      title: "Wandern: Bläsis Mühle",
    });
    expect(feedSourceBadge("sonstiges", "Lilien von Otto")).toEqual({
      label: "Sonstiges",
      className: "udn-feedLinkBubble--sonstiges",
      title: "Lilien von Otto",
    });
    expect(feedSourceBadge("reisen")).toEqual({
      label: "Reisen",
      className: "udn-feedLinkBubble--reisen",
      title: "Aus Reisen",
    });
  });
});
