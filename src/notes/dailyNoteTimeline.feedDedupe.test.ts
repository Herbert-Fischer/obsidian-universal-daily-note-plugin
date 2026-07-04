import { describe, expect, it } from "vitest";
import { dedupeFeedProfileEntries } from "./dailyNoteTimeline";

describe("dedupeFeedProfileEntries", () => {
  it("keeps one wandern feed row when synthetic and callout bullet both exist", () => {
    const entries = dedupeFeedProfileEntries([
      {
        line: 2,
        text: "Kurz ([[Wandern-Tagebuch]])",
        rawLine: "- Kurz ([[Wandern-Tagebuch]])",
        feedProfile: "wandern",
        feedContext: "Wandern Test",
      },
      {
        line: 8,
        text: "Kurz ([[Wandern-Tagebuch]])",
        rawLine: "> - 13:35 Kurz ([[Wandern-Tagebuch]])",
        feedProfile: "wandern",
        feedContext: "Wandern Test",
      },
      {
        line: 1,
        text: "07:10 Aufstehen",
        rawLine: "> - 07:10 Aufstehen",
        feedProfile: "tagebuch",
      },
    ]);
    const wandern = entries.filter((e) => e.feedProfile === "wandern");
    expect(wandern).toHaveLength(1);
    expect(wandern[0]?.rawLine).toContain(">");
    expect(entries.filter((e) => e.feedProfile === "tagebuch")).toHaveLength(1);
  });
});
