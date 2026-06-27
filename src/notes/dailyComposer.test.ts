import { describe, expect, it } from "vitest";
import {
  buildChipEntryText,
  COMPOSER_SECTION_PRESETS,
  rewriteJournalBullets,
  suggestSummaryFromEntries,
  updateSummaryInContent,
  DEFAULT_COMPOSER_CHIPS,
} from "./dailyComposer";
import { finalizeJournalHeadings } from "./journalHeadingFilter";
import { extractJournalLines, extractJournalLinesFromCallout } from "./dailyNoteTimeline";

describe("rewriteJournalBullets", () => {
  it("writes Tagebuch entries into a dated callout", () => {
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
    const date = new Date(2026, 5, 23);
    const out = rewriteJournalBullets(lines, "Tagebuch", ["07:30 Aufstehen", "12:00 Mittagessen: Pizza"], date);
    expect(out).toContain("> [!tagebuch-ref] 23.06.2026");
    expect(out).toContain("> - 07:30 Aufstehen");
    expect(out).toContain("> - 12:00 Mittagessen: Pizza");
    expect(out).not.toContain("- old entry");
    expect(out).toContain("## Aufgaben");
    expect(out).toContain("- task");
  });

  it("creates callout for Sonstiges with heading title", () => {
    const out = rewriteJournalBullets(["# Day"], "Sonstiges", ["Freitext"], new Date(2026, 5, 23));
    expect(out.some((l) => l === "## Sonstiges")).toBe(true);
    expect(out).toContain("> [!notes] Sonstiges");
    expect(out).toContain("> - Freitext");
  });

  it("uses custom callout title when provided", () => {
    const out = rewriteJournalBullets(
      ["## Obsidian Plugin"],
      "Obsidian Plugin",
      ["Entwicklungsumgebung eingerichtet"],
      new Date(2026, 4, 3),
      "Plugin-Dev Session",
    );
    expect(out).toContain("> [!notes] Plugin-Dev Session");
    expect(out).toContain("> - Entwicklungsumgebung eingerichtet");
  });

  it("uses section heading as default callout title", () => {
    const out = rewriteJournalBullets(
      ["## Obsidian Plugin"],
      "Obsidian Plugin",
      ["Entwicklungsumgebung eingerichtet"],
      new Date(2026, 4, 3),
    );
    expect(out).toContain("> [!notes] Obsidian Plugin");
    expect(out).toContain("> - Entwicklungsumgebung eingerichtet");
  });

  it("preserves non-journal lines in the same section", () => {
    const lines = ["## Wichtig", "Hinweistext", "- [ ] Task", "- 12:00 Journal"];
    const out = rewriteJournalBullets(lines, "Wichtig", ["15:00 Update"], new Date(2026, 5, 23));
    expect(out).toContain("Hinweistext");
    expect(out).toContain("- [ ] Task");
    expect(out).toContain("> [!cone] Wichtig");
    expect(out).toContain("> - 15:00 Update");
    expect(out).not.toContain("- 12:00 Journal");
  });

  it("sorts callout bullets by time", () => {
    const out = rewriteJournalBullets(
      ["## Tagebuch"],
      "Tagebuch",
      ["18:00 Abend", "07:30 Aufstehen", "12:00 Mittagessen: Pizza", "Notiz ohne Zeit"],
      new Date(2026, 5, 23),
    );
    const bullets = out.filter((line) => line.startsWith("> - "));
    expect(bullets).toEqual([
      "> - 07:30 Aufstehen",
      "> - 12:00 Mittagessen: Pizza",
      "> - 18:00 Abend",
      "> - Notiz ohne Zeit",
    ]);
  });
});

describe("extractJournalLines callouts", () => {
  it("reads bullets from managed callout under heading", () => {
    const lines = [
      "## Tagebuch",
      "> [!tagebuch] 23.06.2026",
      "> - 07:10 Aufstehen",
      "> - 11:15 Mittagessen: Spinat",
    ];
    expect(extractJournalLines(lines, "Tagebuch").map((e) => e.text)).toEqual([
      "07:10 Aufstehen",
      "11:15 Mittagessen: Spinat",
    ]);
  });

  it("reads legacy callout without heading", () => {
    const lines = [
      "> [!tagebuch-ref] Tagebuch",
      "> - 07:10 Aufstehen",
    ];
    expect(extractJournalLinesFromCallout(lines, "Tagebuch").map((e) => e.text)).toEqual(["07:10 Aufstehen"]);
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

describe("COMPOSER_SECTION_PRESETS", () => {
  it("includes Wandern for composer picker before vault use", () => {
    expect(COMPOSER_SECTION_PRESETS).toContain("Wandern");
    const headings = finalizeJournalHeadings(["Sonstiges"], [], "Tagebuch");
    const merged = finalizeJournalHeadings([...headings, ...COMPOSER_SECTION_PRESETS], [], "Tagebuch");
    expect(merged).toContain("Wandern");
    expect(merged).toContain("Reisen");
    expect(merged).toContain("Sonstiges");
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
