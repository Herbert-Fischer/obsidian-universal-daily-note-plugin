import { Modal, Platform, type App, type TFile } from "obsidian";
import type UniversalDailyNotePlugin from "../../main";
import DailyComposer from "./DailyComposer.svelte";
import { normalizeLocalDay } from "../dateUtils";
import { attachMobileViewport } from "./mobileViewport";
import { normalizeActiveJournalHeading } from "../../notes/journalHeadingFilter";
import { dateFromDailyNoteFile } from "../../integrations/universalCalendar";
import { getMainAreaActiveMarkdownFile } from "../../tagebuchVerweise/mainPageFile";

export type OpenDailyComposerOptions = {
  date?: Date;
  journalHeading?: string;
  onSaved?: () => void;
  onHeadingChange?: (heading: string) => void;
};

export class DailyComposerModal extends Modal {
  private component: DailyComposer | null = null;
  private currentDate: Date;
  private detachViewport: (() => void) | null = null;
  private readonly isMobile = Platform.isMobile;

  constructor(
    app: App,
    private plugin: UniversalDailyNotePlugin,
    options: OpenDailyComposerOptions = {},
  ) {
    super(app);
    this.currentDate = normalizeLocalDay(options.date ?? new Date());
    this.onSaved = options.onSaved;
    this.onHeadingChange = options.onHeadingChange;
    this.initialHeading = normalizeActiveJournalHeading(
      options.journalHeading ?? plugin.settings.outline.journalHeading,
      plugin.settings.outline.excludedHeadings,
    );
  }

  private onSaved?: () => void;
  private onHeadingChange?: (heading: string) => void;
  private initialHeading: string;

  onOpen(): void {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    modalEl.addClass("udn-composerModal");
    if (this.isMobile) {
      modalEl.addClass("udn-composerModal--mobile");
      this.titleEl.hide();
      this.detachViewport = attachMobileViewport(modalEl, contentEl);
    } else {
      this.setTitle("Tages-Composer");
    }
    contentEl.addClass("udn-composerModalContent");

    const { outline, dailyNoteFallback, tagebuchVerweise, quickCapture } = this.plugin.settings;

    this.component = new DailyComposer({
      target: contentEl,
      props: {
        app: this.app,
        date: this.currentDate,
        fallback: dailyNoteFallback,
        initialJournalHeading: this.initialHeading,
        excludedHeadings: outline.excludedHeadings,
        durationDays: outline.durationDays,
        tagebuchSettings: tagebuchVerweise,
        entryPrefixes: quickCapture.entryPrefixes,
        timeFormat: quickCapture.timeFormat,
        isMobile: this.isMobile,
        onClose: () => this.close(),
        onSaved: () => {
          this.onSaved?.();
        },
        onHeadingChange: (heading: string) => {
          this.initialHeading = heading;
          this.onHeadingChange?.(heading);
        },
        onDateChange: (d: Date) => {
          this.currentDate = normalizeLocalDay(d);
        },
      },
    });
  }

  onClose(): void {
    this.detachViewport?.();
    this.detachViewport = null;
    this.component?.$destroy();
    this.component = null;
    this.modalEl.removeClass("udn-composerModal");
    this.modalEl.removeClass("udn-composerModal--mobile");
  }
}

export function resolveComposerDateFromFile(
  plugin: UniversalDailyNotePlugin,
  file?: TFile | null,
): Date | null {
  const target = file ?? getMainAreaActiveMarkdownFile(plugin.app);
  if (!target) return null;
  return dateFromDailyNoteFile(
    target,
    plugin.settings.dailyNoteFallback,
    plugin.settings.tagebuchVerweise,
  );
}

export function openDailyComposer(
  plugin: UniversalDailyNotePlugin,
  options: OpenDailyComposerOptions = {},
): DailyComposerModal {
  const modal = new DailyComposerModal(plugin.app, plugin, options);
  modal.open();
  return modal;
}
