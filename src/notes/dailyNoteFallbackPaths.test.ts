import { describe, expect, it } from "vitest";
import { formatFallbackFilename, getFallbackDailyNoteVaultPath } from "./dailyNoteFallbackPaths";

describe("dailyNoteFallbackPaths", () => {
  const fallback = {
    folder: "Daily",
    filenameFormat: "YYYY-MM-DD",
    templatePath: null,
  };

  it("formats filename with date tokens", () => {
    const d = new Date(2026, 5, 21);
    expect(formatFallbackFilename(d, "YYYY-MM-DD")).toBe("2026-06-21");
  });

  it("builds vault path with folder", () => {
    const d = new Date(2026, 5, 21);
    expect(getFallbackDailyNoteVaultPath(d, fallback)).toBe("Daily/2026-06-21");
  });
});
