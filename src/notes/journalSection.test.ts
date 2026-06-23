import { describe, expect, it } from "vitest";
import {
  dailyNoteLabelToDateKey,
  isDailyNoteInDateRange,
  journalHeadingForLine,
} from "./journalSection";

describe("journalSection", () => {
  it("finds section for a line number", () => {
    const lines = ["## Tagebuch", "- link [[X]]", "## Sonstiges", "- other"];
    expect(journalHeadingForLine(lines, 1)).toBe("Tagebuch");
    expect(journalHeadingForLine(lines, 3)).toBe("Sonstiges");
  });

  it("parses daily note date keys", () => {
    expect(dailyNoteLabelToDateKey("2026-01-27")).toBe("2026-01-27");
    expect(dailyNoteLabelToDateKey("2026-01-27 [conflicted]")).toBe("2026-01-27");
    expect(isDailyNoteInDateRange("2026-01-27", "2026-01-01", "2026-01-31")).toBe(true);
    expect(isDailyNoteInDateRange("2026-02-01", "2026-01-01", "2026-01-31")).toBe(false);
  });
});
