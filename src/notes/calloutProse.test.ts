import { describe, expect, it } from "vitest";
import {
  calloutProseLinesToDetail,
  detailToCalloutProseLines,
  stripCalloutPrefixRaw,
} from "./calloutProse";

describe("calloutProse", () => {
  it("preserves markdown and blank lines in callout lines", () => {
    const detail = "**HAR:** OK\n\n- Punkt 1\n- [[EFH Hettenhausen]]";
    expect(detailToCalloutProseLines(detail)).toEqual([
      "> **HAR:** OK",
      ">",
      "> - Punkt 1",
      "> - [[EFH Hettenhausen]]",
    ]);
  });

  it("roundtrips callout prose lines", () => {
    const lines = ["> **Bold**", ">", "> - item"];
    expect(calloutProseLinesToDetail(lines)).toBe("**Bold**\n\n- item");
  });

  it("stripCalloutPrefixRaw keeps inner spacing", () => {
    expect(stripCalloutPrefixRaw(">   - nested")).toBe("  - nested");
  });
});
