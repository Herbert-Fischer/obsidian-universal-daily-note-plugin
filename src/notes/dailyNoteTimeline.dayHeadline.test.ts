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

  it("uses callout title for section filter when YAML summary is empty", () => {
    expect(resolveDayHeadline(lines, "Obsidian Plugin", "", "2026-05-03")).toBe(
      "Obsidian Plugin",
    );
    expect(resolveDayHeadline(lines, "Tagebuch", "", "2026-05-03")).toBe("");
  });

  it("uses callout title for section filter even when YAML summary is set", () => {
    const linesWithWeather = [
      "## Tagebuch",
      "> [!tagebuch-ref] 03.05.2026 · ⛅ 18 °C bewölkt, Gersfeld",
      "> - 08:10 Aufstehen",
    ];
    expect(resolveDayHeadline(linesWithWeather, "Tagebuch", "⛅ 18 °C, Gersfeld", "2026-05-03")).toBe(
      "⛅ 18 °C bewölkt, Gersfeld",
    );
  });
});
