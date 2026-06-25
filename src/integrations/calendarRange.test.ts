import { describe, expect, it } from "vitest";
import { resolveOutlineLoadAnchor } from "./calendarRange";

describe("resolveOutlineLoadAnchor", () => {
  it("uses today in scroll mode regardless of selected day", () => {
    const selected = new Date(2026, 5, 10);
    const anchor = resolveOutlineLoadAnchor("scroll", {
      selectedDate: selected,
      monthCursor: new Date(2026, 5, 1),
    });
    const today = new Date();
    expect(anchor.getFullYear()).toBe(today.getFullYear());
    expect(anchor.getMonth()).toBe(today.getMonth());
    expect(anchor.getDate()).toBe(today.getDate());
  });

  it("uses selected day in week mode", () => {
    const selected = new Date(2026, 5, 10);
    const anchor = resolveOutlineLoadAnchor("week", {
      selectedDate: selected,
      monthCursor: new Date(2026, 5, 1),
    });
    expect(anchor.getTime()).toBe(selected.getTime());
  });
});
