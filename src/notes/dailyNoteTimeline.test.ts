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
    expect(extractJournalLines(lines, "Tagebuch")).toEqual([
      { line: 2, text: "Inhalt", rawLine: "- Inhalt", feedProfile: "tagebuch" },
    ]);
  });

  it("strips inline udn-entry metadata from managed callout bullets", () => {
    const lines = [
      "## Tagebuch",
      "> [!tagebuch-ref] 01.06.2026",
      '> - 13:06 Fahrt nach Obernburg [[Knauss Boxstar Lifetime 2BE|Boxi]] <!-- udn-entry:{"id":"3m2g","profile":"reisen","context":"Erbach, Krebsnachsorge","callout":"3m2g"} -->',
    ];
    const entries = extractJournalLines(lines, "Tagebuch");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.text).toBe("13:06 Fahrt nach Obernburg [[Knauss Boxstar Lifetime 2BE|Boxi]]");
    expect(entries[0]?.text).not.toContain("udn-entry");
    expect(entries[0]?.feedProfile).toBe("reisen");
    expect(entries[0]?.entryId).toBe("3m2g");
  });

  it("reads udn-entry metadata from the following callout line", () => {
    const lines = [
      "## Tagebuch",
      "> [!tagebuch-ref] 01.06.2026",
      "> - 13:06 Fahrt nach Obernburg [[Knauss Boxstar Lifetime 2BE|Boxi]]",
      '> <!-- udn-entry:{"id":"3m2g","profile":"reisen","context":"Erbach, Krebsnachsorge","callout":"3m2g"} -->',
    ];
    const entries = extractJournalLines(lines, "Tagebuch");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.text).not.toContain("udn-entry");
    expect(entries[0]?.entryId).toBe("3m2g");
  });

  it("does not treat the next bullet inline meta as metadata for the previous line", () => {
    const lines = [
      "## Tagebuch",
      "> [!tagebuch-ref] 03.07.2026",
      "> - 13:30 Termin: Lindengut",
      '> - 17:10 Sternentag <!-- udn-entry:{"id":"4lpq","profile":"reisen","context":"testreise","callout":"4lpq"} -->',
    ];
    const entries = extractJournalLines(lines, "Tagebuch");
    expect(entries.map((e) => e.text)).toEqual(["13:30 Termin: Lindengut", "17:10 Sternentag"]);
    expect(entries[1]?.entryId).toBe("4lpq");
  });

  it("loads a realistic daily note with inline and following-line entry meta", () => {
    const lines = [
      "## Tagebuch",
      "> [!tagebuch-ref] 03.07.2026",
      "> - 07:30 Aufstehen: Sleep Score 67",
      "> - 11:00 Spaziergang:",
      "> - 13:30 Termin: Lindengut mit Mona & Hermann",
      '> - 17:10 Sternentag <!-- udn-entry:{"id":"4lpq","profile":"reisen","context":"testreise","callout":"4lpq"} -->',
      "> - 21:00 Übernachtung in Motten",
      '> <!-- udn-entry:{"id":"xvjw","profile":"reisen","context":"testreise","callout":"xvjw"} -->',
    ];
    const entries = extractJournalLines(lines, "Tagebuch");
    expect(entries.map((e) => e.text)).toEqual([
      "07:30 Aufstehen: Sleep Score 67",
      "11:00 Spaziergang:",
      "13:30 Termin: Lindengut mit Mona & Hermann",
      "17:10 Sternentag",
      "21:00 Übernachtung in Motten",
    ]);
    expect(entries[3]?.entryId).toBe("4lpq");
    expect(entries[4]?.entryId).toBe("xvjw");
  });
});

describe("dateKeyFromDailyNoteBasename", () => {
  it("parses strict and conflicted daily note names", async () => {
    const { dateKeyFromDailyNoteBasename } = await import("./dailyNoteFallbackPaths");
    expect(dateKeyFromDailyNoteBasename("2026-06-23.md", "YYYY-MM-DD")).toBe("2026-06-23");
    expect(dateKeyFromDailyNoteBasename("2026-06-23 [conflicted].md", "YYYY-MM-DD")).toBe("2026-06-23");
  });
});
