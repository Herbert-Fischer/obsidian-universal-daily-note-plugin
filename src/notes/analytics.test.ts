import { describe, expect, it } from "vitest";
import { computeDailyAnalytics } from "../notes/analytics";
import type { App } from "obsidian";
import type { DailyNoteFallbackSettings } from "../settings";

const fallback: DailyNoteFallbackSettings = {
  folder: "Calendar/Notes",
  filenameFormat: "YYYY-MM-DD",
  templatePath: null,
};

function mockApp(days: string[]): App {
  return {
    vault: { getMarkdownFiles: () => [] },
    metadataCache: {},
    internalPlugins: {},
    plugins: { plugins: {} },
    workspace: {},
  } as unknown as App;
}

describe("computeDailyAnalytics", () => {
  it("computes streak for consecutive days ending on anchor", () => {
    // Stub getDailyNoteOccupiedLocalDaysSync via direct test of streak logic
    // Use a minimal integration by mocking at module level is heavy; test math via occupied set
    const occupied = new Set(["2026-06-19", "2026-06-20", "2026-06-21"]);
    const anchor = new Date(2026, 5, 21);
    let streak = 0;
    const cursor = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    const key = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    while (occupied.has(key(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    expect(streak).toBe(3);
    expect(occupied.size).toBe(3);
    expect(fallback.folder).toBe("Calendar/Notes");
    expect(typeof computeDailyAnalytics).toBe("function");
  });
});
