import { describe, expect, it } from "vitest";
import { readSummaryFromContent } from "./dailyNoteSummary";

describe("readSummaryFromContent", () => {
  it("reads Zusammenfassung from frontmatter", () => {
    const content = "---\nZusammenfassung: ⛅ 18 °C, Gersfeld\n---\n\n## Tagebuch\n";
    expect(readSummaryFromContent(content)).toBe("⛅ 18 °C, Gersfeld");
  });

  it("reads quoted values", () => {
    const content = '---\nZusammenfassung: "Pizza; Spaziergang"\n---\n';
    expect(readSummaryFromContent(content)).toBe("Pizza; Spaziergang");
  });
});
