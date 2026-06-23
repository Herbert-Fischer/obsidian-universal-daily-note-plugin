import { writable, type Writable } from "svelte/store";
import type { TFile } from "obsidian";
import type { SectionId, UniversalDailyNoteSettings } from "../settings";
import { DEFAULT_SECTIONS_COLLAPSED } from "../settings";
import { normalizeLocalDay } from "./dateUtils";

import type { CalendarSyncContext } from "../integrations/calendarRange";

export type PanelStore = {
  selectedDate: Writable<Date>;
  calendarContext: Writable<CalendarSyncContext | null>;
  activeFile: Writable<TFile | null>;
  collapsed: Writable<Record<SectionId, boolean>>;
  refreshTick: Writable<number>;
};

export function createPanelStore(initialDate: Date, settings: UniversalDailyNoteSettings): PanelStore {
  const normalized = normalizeLocalDay(initialDate);
  return {
    selectedDate: writable(normalized),
    calendarContext: writable<CalendarSyncContext | null>({
      selectedDate: normalized,
      monthCursor: new Date(normalized.getFullYear(), normalized.getMonth(), 1),
    }),
    activeFile: writable<TFile | null>(null),
    collapsed: writable({ ...DEFAULT_SECTIONS_COLLAPSED, ...settings.sections.collapsed }),
    refreshTick: writable(0),
  };
}

export function bumpRefresh(store: PanelStore): void {
  store.refreshTick.update((n) => n + 1);
}
