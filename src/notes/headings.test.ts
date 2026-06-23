import { describe, expect, it } from "vitest";

type HeadingCache = { heading: string; level: number; position?: { start?: { line?: number } } };

function mapHeadings(headings: HeadingCache[]) {
  return headings.map((h) => ({
    text: h.heading,
    level: h.level,
    line: h.position?.start?.line ?? 0,
  }));
}

describe("getNoteHeadings mapping", () => {
  it("maps metadata cache headings", () => {
    const out = mapHeadings([
      { heading: "Log", level: 2, position: { start: { line: 4 } } },
      { heading: "Review", level: 3, position: { start: { line: 10 } } },
    ]);
    expect(out).toEqual([
      { text: "Log", level: 2, line: 4 },
      { text: "Review", level: 3, line: 10 },
    ]);
  });
});
