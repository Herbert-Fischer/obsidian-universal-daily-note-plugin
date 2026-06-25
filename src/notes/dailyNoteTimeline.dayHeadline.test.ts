import { describe, expect, it } from "vitest";
import { ALL_JOURNAL_HEADINGS } from "./journalHeadingFilter";
import { resolveDayHeadline } from "./dailyNoteTimeline";

describe("resolveDayHeadline", () => {
  const lines = [
    "## Tagebuch",
    "> [!tagebuch-ref] 03.05.2026",
    "> - 08:10 Aufstehen",
    "## Obsidian Plugin",
    "> [!notes] Obsidian Plugin",
    "> - Plugin-Entwicklung",
  ];

  it("uses YAML summary for Alle filter", () => {
    expect(resolveDayHeadline(lines, ALL_JOURNAL_HEADINGS, "CURSOR Pro Abo", "2026-05-03")).toBe(
      "CURSOR Pro Abo",
    );
  });

  it("uses callout title for section filter", () => {
    expect(resolveDayHeadline(lines, "Obsidian Plugin", "CURSOR Pro Abo", "2026-05-03")).toBe(
      "Obsidian Plugin",
    );
    expect(resolveDayHeadline(lines, "Tagebuch", "CURSOR Pro Abo", "2026-05-03")).toBe("03.05.2026");
  });
});
