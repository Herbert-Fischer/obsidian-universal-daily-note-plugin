import { describe, expect, it } from "vitest";
import {
  isoWeekBounds,
  localDateKey,
  monthBoundsFromCursor,
  outlineRangeModeLabel,
  resolveOutlineDateBounds,
} from "./calendarRange";

describe("calendarRange", () => {
  it("computes month bounds from cursor", () => {
    const cursor = new Date(2026, 0, 15);
    const bounds = monthBoundsFromCursor(cursor);
    expect(localDateKey(bounds.start)).toBe("2026-01-01");
    expect(localDateKey(bounds.end)).toBe("2026-01-31");
  });

  it("computes ISO week bounds (Mon–Sun)", () => {
    const wed = new Date(2026, 0, 28);
    const { start, end } = isoWeekBounds(wed);
    expect(localDateKey(start)).toBe("2026-01-26");
    expect(localDateKey(end)).toBe("2026-02-01");
  });

  it("resolves month and week bounds from calendar context", () => {
    const ctx = {
      selectedDate: new Date(2026, 0, 27),
      monthCursor: new Date(2026, 0, 1),
    };
    expect(resolveOutlineDateBounds("month", ctx)).toEqual({
      startDateKey: "2026-01-01",
      endDateKey: "2026-01-31",
    });
    expect(resolveOutlineDateBounds("week", ctx)).toEqual({
      startDateKey: "2026-01-26",
      endDateKey: "2026-02-01",
    });
    expect(resolveOutlineDateBounds("scroll", ctx)).toBeNull();
  });

  it("labels scroll mode as Alle", () => {
    expect(outlineRangeModeLabel("scroll")).toBe("Alle");
  });
});
