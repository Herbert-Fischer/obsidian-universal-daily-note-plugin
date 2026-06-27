import { describe, expect, it } from "vitest";
import { cleanupReisenCalendarSyncInLines } from "./cleanupReisenCalendarSync";

describe("cleanupReisenCalendarSyncInLines", () => {
  it("removes calendar sync lines from Reisen and moves missing ones to Tagebuch", () => {
    const input = [
      "---",
      "Zusammenfassung: Test",
      "---",
      "",
      "## Tagebuch",
      "",
      "> [!tagebuch-ref] 24.06.2026",
      "> - 08:00 Aufstehen",
      "",
      "## Reisen",
      "",
      "> [!compass] Reisen [Italien]",
      "> - 10:00 Termin: Flug <!-- udn-cal:evt-1 -->",
      "> - 12:00 Etappe: Rom",
      "> - 14:00 Termin: Bahn <!-- udn-cal:evt-2 -->",
    ];

    const { lines, result } = cleanupReisenCalendarSyncInLines(input, new Date(2026, 5, 24));
    expect(result.removed).toBe(2);
    expect(result.moved).toBe(2);

    const text = lines.join("\n");
    expect(text).toContain("Termin: Flug <!-- udn-cal:evt-1 -->");
    expect(text).toContain("Termin: Bahn <!-- udn-cal:evt-2 -->");
    expect(text).toContain("Etappe: Rom");

    const reisenBlock = text.split("## Reisen")[1] ?? "";
    expect(reisenBlock).not.toContain("udn-cal:");
    expect(reisenBlock).toContain("Etappe: Rom");
  });

  it("does not duplicate calendar ids already in Tagebuch", () => {
    const input = [
      "## Tagebuch",
      "> [!tagebuch-ref] 24.06.2026",
      "> - 10:00 Termin: Flug <!-- udn-cal:evt-1 -->",
      "",
      "## Reisen",
      "> [!compass] Reisen [Italien]",
      "> - 10:00 Termin: Flug <!-- udn-cal:evt-1 -->",
    ];

    const { result } = cleanupReisenCalendarSyncInLines(input);
    expect(result.removed).toBe(1);
    expect(result.moved).toBe(0);
  });
});
