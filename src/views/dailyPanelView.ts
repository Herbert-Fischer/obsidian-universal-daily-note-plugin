import { ItemView, WorkspaceLeaf } from "obsidian";
import {
  applyDenkariumItemViewScrollLayout,
  clearDenkariumItemViewScrollLayout,
} from "@denkarium/obsidian-lib-vault";
import { dk } from "@denkarium/obsidian-lib-ui";
import type UniversalDailyNotePlugin from "../main";
import { mountDailyPanel, type DailyPanelMount } from "../panel/mountDailyPanel";
import { VIEW_TYPE_DAILY_PANEL } from "./viewTypes";

import type { CalendarSyncContext } from "../integrations/calendarRange";

export class DailyPanelView extends ItemView {
  private plugin: UniversalDailyNotePlugin;
  private panelMount: DailyPanelMount | null = null;
  private pendingDate: Date | null = null;
  private pendingCalendarContext: CalendarSyncContext | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: UniversalDailyNotePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_DAILY_PANEL;
  }

  getDisplayText(): string {
    return "Tagebuch-Outline";
  }

  getIcon(): string {
    return "list-tree";
  }

  setSelectedDate(date: Date): void {
    if (this.panelMount) {
      this.panelMount.setSelectedDate(date);
      this.pendingDate = null;
    } else {
      this.pendingDate = date;
    }
  }

  setCalendarContext(ctx: CalendarSyncContext): void {
    if (this.panelMount) {
      this.panelMount.setCalendarContext(ctx);
      this.pendingCalendarContext = null;
    } else {
      this.pendingCalendarContext = ctx;
    }
  }

  pinOutlineDay(date: Date, options?: { refresh?: boolean }): void {
    this.panelMount?.pinOutlineDay(date, options);
  }

  async onOpen(): Promise<void> {
    applyDenkariumItemViewScrollLayout(this);

    const root = this.contentEl.createDiv({ cls: `${dk.root} ${dk.view} udn-view udn-view--outline` });
    this.panelMount = mountDailyPanel(root, this.plugin);
    if (this.pendingCalendarContext) {
      this.panelMount.setCalendarContext(this.pendingCalendarContext);
      this.pendingCalendarContext = null;
    } else if (this.pendingDate) {
      this.panelMount.setSelectedDate(this.pendingDate);
      this.pendingDate = null;
    }
  }

  async onClose(): Promise<void> {
    this.panelMount?.destroy();
    this.panelMount = null;
    this.contentEl.empty();
    clearDenkariumItemViewScrollLayout(this);
  }
}
