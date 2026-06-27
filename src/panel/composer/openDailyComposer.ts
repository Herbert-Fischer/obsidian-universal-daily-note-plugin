import { Modal, Platform, type App, type TFile } from "obsidian";
import type UniversalDailyNotePlugin from "../../main";
import DailyComposer from "./DailyComposer.svelte";
import { DEFAULT_SETTINGS } from "../../settings";
import { normalizeLocalDay } from "../dateUtils";
import { attachMobileViewport } from "./mobileViewport";
import { normalizeActiveJournalHeading } from "../../notes/journalHeadingFilter";
import { dateFromDailyNoteFile } from "../../integrations/universalCalendar";
import { getMainAreaActiveMarkdownFile } from "../../tagebuchVerweise/mainPageFile";
import { runInsertWeather } from "../../weather/runInsertWeather";
import { attachComposerDrag, applyComposerWindowPosition } from "./composerDrag";

export type OpenDailyComposerOptions = {
  date?: Date;
  journalHeading?: string;
  onSaved?: (date: Date) => void;
  onDateChange?: (date: Date) => void;
  onHeadingChange?: (heading: string) => void;
};

export class DailyComposerModal extends Modal {
  private component: DailyComposer | null = null;
  private currentDate: Date;
  private detachViewport: (() => void) | null = null;
  private detachDrag: (() => void) | null = null;
  private readonly isMobile = Platform.isMobile;

  constructor(
    app: App,
    private plugin: UniversalDailyNotePlugin,
    options: OpenDailyComposerOptions = {},
  ) {
    super(app);
    this.currentDate = normalizeLocalDay(options.date ?? new Date());
    this.onSaved = options.onSaved;
    this.onDateChange = options.onDateChange;
    this.onHeadingChange = options.onHeadingChange;
    this.initialHeading = normalizeActiveJournalHeading(
      options.journalHeading ?? plugin.settings.outline.journalHeading,
      plugin.settings.outline.excludedHeadings,
    );
  }

  private onSaved?: (date: Date) => void;
  private onDateChange?: (date: Date) => void;
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
      this.modalEl.addClass("udn-composerModal--draggableHost");
      applyComposerWindowPosition(this.modalEl, this.plugin.settings.composerWindow ?? { x: null, y: null });
      this.detachDrag = attachComposerDrag(
        this.modalEl,
        this.titleEl,
        this.plugin.settings.composerWindow ?? { x: null, y: null },
        (pos) => {
          this.plugin.settings.composerWindow = { x: pos.x, y: pos.y };
          void this.plugin.saveSettings();
        },
      );
    }
    contentEl.addClass("udn-composerModalContent");

    const { outline, dailyNoteFallback, tagebuchVerweise, quickCapture, composerTemplates, tracks, weatherCapture } =
      this.plugin.settings;

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
        calendarSync: this.plugin.settings.calendarSync ?? DEFAULT_SETTINGS.calendarSync,
        composerTemplates: composerTemplates ?? DEFAULT_SETTINGS.composerTemplates,
        tracksSettings: tracks ?? DEFAULT_SETTINGS.tracks,
        wandernLayout: this.plugin.settings.wandernLayout ?? DEFAULT_SETTINGS.wandernLayout,
        attachmentsFolder: quickCapture.attachmentsFolder,
        weatherLastLocation: weatherCapture.lastLocation,
        timeFormat: quickCapture.timeFormat,
        isMobile: this.isMobile,
        onClose: () => this.close(),
        onSaved: () => {
          this.onSaved?.(this.currentDate);
        },
        onHeadingChange: (heading: string) => {
          this.initialHeading = heading;
          this.onHeadingChange?.(heading);
        },
        onDateChange: (d: Date) => {
          this.currentDate = normalizeLocalDay(d);
          this.onDateChange?.(this.currentDate);
        },
        onInsertWeather: async () => {
          const ok = await runInsertWeather(this.plugin, this.currentDate, this.initialHeading);
          if (ok) this.onSaved?.(this.currentDate);
          return ok;
        },
        onPersistSideEffects: (patch) => {
          if (patch.lastLocation !== undefined) {
            this.plugin.settings.weatherCapture.lastLocation = patch.lastLocation;
          }
          if (patch.lastTripLabel !== undefined) {
            this.plugin.settings.composerTemplates.lastTripLabel = patch.lastTripLabel;
          }
          void this.plugin.saveSettings();
        },
      },
    });
  }

  onClose(): void {
    this.detachDrag?.();
    this.detachDrag = null;
    this.detachViewport?.();
    this.detachViewport = null;
    this.component?.$destroy();
    this.component = null;
    this.modalEl.removeClass("udn-composerModal");
    this.modalEl.removeClass("udn-composerModal--mobile");
    this.modalEl.removeClass("udn-composerModal--draggableHost");
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
