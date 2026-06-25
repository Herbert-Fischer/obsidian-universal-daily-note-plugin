import { describe, expect, it } from "vitest";
import { applyDailyNoteTemplate } from "./dailyNoteTemplate";

describe("applyDailyNoteTemplate", () => {
  const date = new Date(2026, 5, 24);

  it("resolves bare date placeholders", () => {
    const out = applyDailyNoteTemplate("Erstellt: {date}\nAlso: {{date}}", date);
    expect(out).toBe("Erstellt: 2026-06-24\nAlso: 2026-06-24");
  });

  it("resolves formatted date placeholders", () => {
    const out = applyDailyNoteTemplate("> [!tagebuch-ref] {{date:DD.MM.YYYY}}", date);
    expect(out).toBe("> [!tagebuch-ref] 24.06.2026");
  });
});
