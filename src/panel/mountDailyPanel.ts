import type UniversalDailyNotePlugin from "../main";
import DailyPanel from "./DailyPanel.svelte";
import type { PanelStore } from "./panelStore";
import { normalizeLocalDay } from "./dateUtils";

import type { CalendarSyncContext } from "../integrations/calendarRange";

export type DailyPanelMount = {
  destroy: () => void;
  setSelectedDate: (date: Date) => void;
  setCalendarContext: (ctx: CalendarSyncContext) => void;
};

export function mountDailyPanel(
  target: HTMLElement,
  plugin: UniversalDailyNotePlugin,
): DailyPanelMount {
  let storeRef: PanelStore | null = null;
  let setSelectedDateFn: ((date: Date) => void) | null = null;
  let setCalendarContextFn: ((ctx: CalendarSyncContext) => void) | null = null;

  const component = new DailyPanel({
    target,
    props: {
      app: plugin.app,
      plugin,
      onStoreReady: (store, setSelectedDate, setCalendarContext) => {
        storeRef = store;
        setSelectedDateFn = setSelectedDate;
        setCalendarContextFn = setCalendarContext;
      },
    },
  });

  return {
    destroy: () => {
      component.$destroy();
      storeRef = null;
      setSelectedDateFn = null;
      setCalendarContextFn = null;
    },
    setSelectedDate: (date: Date) => {
      if (setSelectedDateFn) {
        setSelectedDateFn(normalizeLocalDay(date));
        return;
      }
      storeRef?.selectedDate.set(normalizeLocalDay(date));
    },
    setCalendarContext: (ctx: CalendarSyncContext) => {
      const normalized: CalendarSyncContext = {
        selectedDate: normalizeLocalDay(ctx.selectedDate),
        monthCursor: normalizeLocalDay(ctx.monthCursor),
      };
      if (setCalendarContextFn) {
        setCalendarContextFn(normalized);
        return;
      }
      storeRef?.calendarContext.set(normalized);
      storeRef?.selectedDate.set(normalized.selectedDate);
    },
  };
}
