import { describe, expect, it, vi } from "vitest";
import { syncUniversalCalendarFromContext } from "./universalCalendar";

const VIEW_TYPE_UNICAL = "universal-calendar-view";

describe("syncUniversalCalendarFromContext", () => {
  it("calls setCalendarContext on calendar leaves when sync enabled", () => {
    const setCalendarContext = vi.fn();
    const date = new Date(2026, 5, 21);
    const month = new Date(2026, 5, 1);
    const app = {
      plugins: {
        plugins: {
          "universal-calendar": { settings: { syncDailyNotePanel: true } },
        },
      },
      workspace: {
        getLeavesOfType: () => [{ view: { setCalendarContext } }],
      },
    };
    syncUniversalCalendarFromContext(app as never, { selectedDate: date, monthCursor: month });
    expect(setCalendarContext).toHaveBeenCalledWith({ selectedDate: date, monthCursor: month });
  });

  it("no-ops when calendar sync disabled", () => {
    const setCalendarContext = vi.fn();
    const app = {
      plugins: {
        plugins: {
          "universal-calendar": { settings: { syncDailyNotePanel: false } },
        },
      },
      workspace: {
        getLeavesOfType: () => [{ view: { setCalendarContext } }],
      },
    };
    syncUniversalCalendarFromContext(app as never, {
      selectedDate: new Date(),
      monthCursor: new Date(),
    });
    expect(setCalendarContext).not.toHaveBeenCalled();
  });

  it("falls back to setSelectedDate", () => {
    const setSelectedDate = vi.fn();
    const date = new Date(2026, 0, 15);
    const app = {
      plugins: {
        plugins: {
          "universal-calendar": { settings: { syncDailyNotePanel: true } },
        },
      },
      workspace: {
        getLeavesOfType: () => [{ view: { setSelectedDate } }],
      },
    };
    syncUniversalCalendarFromContext(app as never, {
      selectedDate: date,
      monthCursor: new Date(2026, 0, 1),
    });
    expect(setSelectedDate).toHaveBeenCalledWith(date);
  });
});
