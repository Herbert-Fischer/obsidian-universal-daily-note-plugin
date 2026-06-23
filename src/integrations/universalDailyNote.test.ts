import { describe, expect, it, vi } from "vitest";

const UDN_VIEW_TYPE = "universal-daily-note-panel";

function syncUniversalDailyNotePanelToSelectedDate(
  app: {
    plugins: { plugins: Record<string, unknown> };
    workspace: { getLeavesOfType: (t: string) => Array<{ view: { setSelectedDate?: (d: Date) => void } }> };
  },
  date: Date,
): void {
  if (!app.plugins.plugins["universal-daily-note"]) return;
  for (const leaf of app.workspace.getLeavesOfType(UDN_VIEW_TYPE)) {
    leaf.view.setSelectedDate?.(date);
  }
}

describe("syncUniversalDailyNotePanelToSelectedDate", () => {
  it("calls setSelectedDate on panel leaves", () => {
    const setSelectedDate = vi.fn();
    const app = {
      plugins: { plugins: { "universal-daily-note": {} } },
      workspace: {
        getLeavesOfType: () => [{ view: { setSelectedDate } }],
      },
    };
    const date = new Date(2026, 5, 21);
    syncUniversalDailyNotePanelToSelectedDate(app, date);
    expect(setSelectedDate).toHaveBeenCalledWith(date);
  });

  it("no-ops when daily note plugin missing", () => {
    const setSelectedDate = vi.fn();
    const app = {
      plugins: { plugins: {} },
      workspace: {
        getLeavesOfType: () => [{ view: { setSelectedDate } }],
      },
    };
    syncUniversalDailyNotePanelToSelectedDate(app, new Date());
    expect(setSelectedDate).not.toHaveBeenCalled();
  });
});
