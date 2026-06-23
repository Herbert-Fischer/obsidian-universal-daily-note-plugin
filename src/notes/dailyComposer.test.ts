import { describe, expect, it } from "vitest";
import {
  buildChipEntryText,
  rewriteJournalBullets,
  suggestSummaryFromEntries,
  updateSummaryInContent,
  DEFAULT_COMPOSER_CHIPS,
} from "./dailyComposer";

describe("rewriteJournalBullets", () => {
  it("replaces bullets under Tagebuch and keeps other sections", () => {
    const lines = [
      "---",
      "x: 1",
      "---",
      "## Tagebuch",
      "- old entry",
      "",
      "## Aufgaben",
      "- task",
    ];
    const out = rewriteJournalBullets(lines, "Tagebuch", ["07:30 Aufstehen", "12:00 Mittagessen: Pizza"]);
    expect(out).toContain("- 07:30 Aufstehen");
    expect(out).toContain("- 12:00 Mittagessen: Pizza");
    expect(out).not.toContain("- old entry");
    expect(out).toContain("## Aufgaben");
    expect(out).toContain("- task");
  });

  it("appends section when missing", () => {
    const out = rewriteJournalBullets(["# Day"], "Tagebuch", ["Freitext"]);
    expect(out.some((l) => l === "## Tagebuch")).toBe(true);
    expect(out).toContain("- Freitext");
  });
});

describe("updateSummaryInContent", () => {
  it("updates existing Zusammenfassung in frontmatter", () => {
    const content = "---\nfileClass: Daily Notes\nZusammenfassung: alt\n---\n\n## Tagebuch\n";
    const next = updateSummaryInContent(content, "Neue Summary");
    expect(next).toContain("Zusammenfassung: Neue Summary");
    expect(next).not.toContain("Zusammenfassung: alt");
  });

  it("adds Zusammenfassung when missing", () => {
    const content = "---\nfileClass: Daily Notes\n---\n\n## Tagebuch\n";
    const next = updateSummaryInContent(content, "Frisch");
    expect(next).toContain("Zusammenfassung: Frisch");
  });
});

describe("suggestSummaryFromEntries", () => {
  it("builds summary from Mittagessen and Spaziergang", () => {
    const summary = suggestSummaryFromEntries([
      "07:30 Aufstehen",
      "12:15 Mittagessen: Pizza",
      "11:00 Spaziergang: Dorfrunde",
    ]);
    expect(summary).toContain("Pizza");
    expect(summary).toContain("Spaziergang");
  });
});

describe("buildChipEntryText", () => {
  it("formats chip templates with time", () => {
    const aufstehen = DEFAULT_COMPOSER_CHIPS[0]!;
    expect(buildChipEntryText(aufstehen, "07:30")).toBe("07:30 Aufstehen");
    const lunch = DEFAULT_COMPOSER_CHIPS[1]!;
    expect(buildChipEntryText(lunch, "12:00")).toBe("12:00 Mittagessen: ");
  });
});
