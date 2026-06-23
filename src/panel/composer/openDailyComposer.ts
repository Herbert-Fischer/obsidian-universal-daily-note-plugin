import { Modal, type App } from "obsidian";
import type UniversalDailyNotePlugin from "../../main";
import DailyComposer from "./DailyComposer.svelte";
import { normalizeLocalDay } from "../dateUtils";

export type OpenDailyComposerOptions = {
  date?: Date;
  onSaved?: () => void;
};

export class DailyComposerModal extends Modal {
  private component: DailyComposer | null = null;
  private currentDate: Date;

  constructor(
    app: App,
    private plugin: UniversalDailyNotePlugin,
    options: OpenDailyComposerOptions = {},
  ) {
    super(app);
    this.currentDate = normalizeLocalDay(options.date ?? new Date());
    this.onSaved = options.onSaved;
  }

  private onSaved?: () => void;

  onOpen(): void {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    modalEl.addClass("udn-composerModal");
    contentEl.addClass("udn-composerModalContent");
    this.setTitle("Tages-Composer");

    this.component = new DailyComposer({
      target: contentEl,
      props: {
        app: this.app,
        date: this.currentDate,
        fallback: this.plugin.settings.dailyNoteFallback,
        journalHeading: this.plugin.settings.outline.journalHeading,
        entryPrefixes: this.plugin.settings.quickCapture.entryPrefixes,
        timeFormat: this.plugin.settings.quickCapture.timeFormat,
        onClose: () => this.close(),
        onSaved: () => {
          this.onSaved?.();
        },
        onDateChange: (d: Date) => {
          this.currentDate = normalizeLocalDay(d);
        },
      },
    });
  }

  onClose(): void {
    this.component?.$destroy();
    this.component = null;
    this.modalEl.removeClass("udn-composerModal");
  }
}

export function openDailyComposer(
  plugin: UniversalDailyNotePlugin,
  options: OpenDailyComposerOptions = {},
): DailyComposerModal {
  const modal = new DailyComposerModal(plugin.app, plugin, options);
  modal.open();
  return modal;
}
