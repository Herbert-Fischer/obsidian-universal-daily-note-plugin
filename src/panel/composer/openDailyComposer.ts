import { Modal, Platform, type App, type TFile } from "obsidian";
import type UniversalDailyNotePlugin from "../../main";
import DailyComposer from "./DailyComposer.svelte";
import { DEFAULT_SETTINGS } from "../../settings";
import { normalizeLocalDay, sameLocalDay } from "../dateUtils";
import { attachMobileViewport, attachComposerMobileKeyboard } from "./mobileViewport";
import { normalizeActiveJournalHeading } from "../../notes/journalHeadingFilter";
import { dateFromDailyNoteFile } from "../../integrations/universalCalendar";
import { getMainAreaActiveMarkdownFile } from "../../tagebuchVerweise/mainPageFile";
import { runInsertWeather } from "../../weather/runInsertWeather";
import { attachComposerDrag, applyComposerWindowPosition } from "./composerDrag";
import { clearComposerDraft } from "./composerDraftCache";

export type ComposerOpenFocus = {
  line?: number;
  entryId?: string;
};

export type OpenDailyComposerOptions = {
  date?: Date;
  journalHeading?: string;
  /** Vault line number of the Tagebuch entry to expand in the composer. */
  focusEntryLine?: number;
  /** Stable udn-entry id to expand in the composer. */
  focusEntryId?: string;
  onSaved?: (date: Date) => void;
  onDateChange?: (date: Date) => void;
  onHeadingChange?: (heading: string) => void;
};

export class DailyComposerModal extends Modal {
  private component: DailyComposer | null = null;
  private currentDate: Date;
  private detachViewport: (() => void) | null = null;
  private detachKeyboard: (() => void) | null = null;
  private detachDrag: (() => void) | null = null;
  private closeGuard: (() => boolean) | null = null;
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
    this.focusEntryLine = options.focusEntryLine;
    this.focusEntryId = options.focusEntryId;
    this.initialHeading = normalizeActiveJournalHeading(
      options.journalHeading ?? plugin.settings.outline.journalHeading,
      plugin.settings.outline.excludedHeadings,
    );
  }

  private onSaved?: (date: Date) => void;
  private onDateChange?: (date: Date) => void;
  private onHeadingChange?: (heading: string) => void;
  private initialHeading: string;
  private focusEntryLine?: number;
  private focusEntryId?: string;

  close(): void {
    if (this.closeGuard && !this.closeGuard()) return;
    clearComposerDraft();
    super.close();
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    this.blockBackdropClose();
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

    const { outline, dailyNoteFallback, tagebuchVerweise, quickCapture, composerTemplates, weatherCapture } =
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
        calendarLinkOverrides: this.plugin.settings.calendarLinkOverrides ?? DEFAULT_SETTINGS.calendarLinkOverrides,
        composerTemplates: composerTemplates ?? DEFAULT_SETTINGS.composerTemplates,
        composerGroupLabels: this.plugin.settings.composerGroupLabels ?? DEFAULT_SETTINGS.composerGroupLabels,
        wandernLayout: this.plugin.settings.wandernLayout ?? DEFAULT_SETTINGS.wandernLayout,
        spaziergangLayout: this.plugin.settings.spaziergangLayout ?? DEFAULT_SETTINGS.spaziergangLayout,
        feedDetailLayout: this.plugin.settings.feedDetailLayout ?? DEFAULT_SETTINGS.feedDetailLayout,
        attachmentsFolder: quickCapture.attachmentsFolder,
        weatherLastLocation: weatherCapture.lastLocation,
        timeFormat: quickCapture.timeFormat,
        isMobile: this.isMobile,
        initialFocusEntryLine: this.focusEntryLine ?? null,
        initialFocusEntryId: this.focusEntryId ?? null,
        onClose: () => this.close(),
        onRegisterCloseGuard: (guard: () => boolean) => {
          this.closeGuard = guard;
        },
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
          if (patch.composerGroupLabels !== undefined) {
            this.plugin.settings.composerGroupLabels = patch.composerGroupLabels;
          }
          void this.plugin.saveSettings();
        },
      },
    });

    if (this.isMobile) {
      window.requestAnimationFrame(() => {
        const composerRoot = contentEl.querySelector(".udn-composer");
        if (composerRoot instanceof HTMLElement) {
          this.detachKeyboard = attachComposerMobileKeyboard(composerRoot, modalEl, contentEl);
        }
      });
    }
  }

  /** Keep the composer open when the user clicks elsewhere in Obsidian (nav, editor, …). */
  private blockBackdropClose(): void {
    const bg = this.containerEl.querySelector(".modal-bg");
    if (bg instanceof HTMLElement) {
      bg.addEventListener("click", (ev) => ev.stopImmediatePropagation(), { capture: true });
    }
  }

  onClose(): void {
    this.detachDrag?.();
    this.detachDrag = null;
    this.detachKeyboard?.();
    this.detachKeyboard = null;
    this.detachViewport?.();
    this.detachViewport = null;
    const component = this.component;
    this.component = null;
    this.modalEl.removeClass("udn-composerModal");
    this.modalEl.removeClass("udn-composerModal--mobile");
    this.modalEl.removeClass("udn-composerModal--draggableHost");
    window.requestAnimationFrame(() => component?.$destroy());
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

export function isComposerModalOpen(): boolean {
  return document.querySelector(".udn-composerModal") !== null;
}

export function scheduleAutoOpenComposerForToday(plugin: UniversalDailyNotePlugin): void {
  const open = (): void => {
    if (isComposerModalOpen()) return;
    plugin.openComposerForDate(new Date());
  };
  window.setTimeout(open, 200);
  window.setTimeout(open, 650);
}

export function maybeAutoOpenComposerForToday(
  plugin: UniversalDailyNotePlugin,
  trigger: "command" | "file-open",
  file?: TFile,
): void {
  const mode = plugin.settings.composer?.autoOpen ?? DEFAULT_SETTINGS.composer.autoOpen;
  if (mode === "never") return;
  if (trigger === "command") {
    if (mode !== "todayCommand") return;
    scheduleAutoOpenComposerForToday(plugin);
    return;
  }
  if (mode !== "todayNoteOpen") return;
  if (!Platform.isMobileApp) return;
  if (!file) return;
  const date = dateFromDailyNoteFile(
    file,
    plugin.settings.dailyNoteFallback,
    plugin.settings.tagebuchVerweise,
  );
  if (!date || !sameLocalDay(date, new Date())) return;
  const todayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  if (plugin.lastAutoComposerDateKey === todayKey) return;
  plugin.lastAutoComposerDateKey = todayKey;
  scheduleAutoOpenComposerForToday(plugin);
}
