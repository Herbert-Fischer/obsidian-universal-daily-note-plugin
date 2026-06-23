import { describe, expect, it } from "vitest";
import { extractJournalLines } from "../notes/dailyNoteTimeline";

describe("extractJournalLines", () => {
  it("extracts bullets under Tagebuch heading", () => {
    const lines = [
      "---",
      "## Tagebuch",
      "- 07:30 Aufstehen",
      "- 08:05 Kaffee",
      "## Aufgaben",
      "- task",
    ];
    const entries = extractJournalLines(lines, "Tagebuch");
    expect(entries).toHaveLength(2);
    expect(entries[0]?.text).toBe("07:30 Aufstehen");
    expect(entries[0]?.rawLine).toBe("- 07:30 Aufstehen");
    expect(entries[1]?.text).toBe("08:05 Kaffee");
  });

  it("ignores empty bullet lines", () => {
    const lines = ["## Tagebuch", "- ", "- Inhalt", "## Ende"];
    expect(extractJournalLines(lines, "Tagebuch")).toEqual([{ line: 2, text: "Inhalt", rawLine: "- Inhalt" }]);
  });
});

describe("dateKeyFromDailyNoteBasename", () => {
  it("parses strict and conflicted daily note names", async () => {
    const { dateKeyFromDailyNoteBasename } = await import("./dailyNoteFallbackPaths");
    expect(dateKeyFromDailyNoteBasename("2026-06-23.md", "YYYY-MM-DD")).toBe("2026-06-23");
    expect(dateKeyFromDailyNoteBasename("2026-06-23 [conflicted].md", "YYYY-MM-DD")).toBe("2026-06-23");
  });
});
