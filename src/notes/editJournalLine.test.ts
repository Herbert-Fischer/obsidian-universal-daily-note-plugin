import { describe, expect, it } from "vitest";
import { rebuildJournalBulletLine } from "./editJournalLine";

describe("rebuildJournalBulletLine", () => {
  it("preserves bullet prefix and time when editing text", () => {
    expect(rebuildJournalBulletLine("- 07:10 Aufstehen", "08:00 Frühstück")).toBe("- 08:00 Frühstück");
  });

  it("preserves callout bullet prefix", () => {
    expect(rebuildJournalBulletLine("> - 11:15 Mittagessen", "12:00 Essen")).toBe("> - 12:00 Essen");
  });

  it("adds default bullet for unexpected lines", () => {
    expect(rebuildJournalBulletLine("plain text", "Neu")).toBe("- Neu");
  });
});

describe("extractJournalLines rawLine", () => {
  it("stores original line content", async () => {
    const { extractJournalLines } = await import("./dailyNoteTimeline");
    const lines = ["## Tagebuch", "- 07:30 Aufstehen"];
    expect(extractJournalLines(lines, "Tagebuch")[0]).toEqual({
      line: 1,
      text: "07:30 Aufstehen",
      rawLine: "- 07:30 Aufstehen",
      feedProfile: "tagebuch",
    });
  });
});
