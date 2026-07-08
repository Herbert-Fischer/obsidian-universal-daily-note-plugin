import { Plugin, Platform, TFile, Notice, type Menu } from "obsidian";
import { DEFAULT_SETTINGS, DEFAULT_SECTIONS_COLLAPSED, type SectionId, type UniversalDailyNoteSettings } from "./settings";
import { normalizeActiveJournalHeading } from "./notes/journalHeadingFilter";
import type { FeedProfile } from "./notes/feedMetadata";
import { normalizeOutlineProfileFilters } from "./notes/feedMetadata";
import { feedProfileForSectionHeading } from "./notes/journalEntryGroups";
import { DEFAULT_JOURNAL_HEADING } from "./settings";
import { UniversalDailyNoteSettingTab } from "./settingsTab";
import { openOrCreateDailyNoteForDate } from "./notes/dailyNote";
import { ensureDailyNoteFileForDate } from "./notes/appendLogLine";
import { DailyPanelView } from "./views/dailyPanelView";
import { VerweisePanelView } from "./views/verweisePanelView";
import { VIEW_TYPE_DAILY_PANEL, VIEW_TYPE_VERWEISE } from "./views/viewTypes";
import { activateDailyPanel } from "./views/activateDailyPanel";
import { activateVerweisePanel } from "./views/activateVerweisePanel";
import { COMPOSER_ICON, COMPOSER_LABEL } from "./panel/composer/composerUi";
import {
  openDailyComposer,
  maybeAutoOpenComposerForToday,
  scheduleAutoOpenComposerForToday,
  resolveComposerDateFromFile as resolveComposerDateFromActiveFile,
} from "./panel/composer/openDailyComposer";
import { dateFromDailyNoteFile } from "./integrations/universalCalendar";
import { runInsertWeather } from "./weather/runInsertWeather";
import { syncCalendarAppointmentsIntoDailyNote } from "./integrations/calendarAppointments";
import { importGarminPendingActivities } from "./integrations/garminPendingImport";
import { cleanupReisenCalendarSyncForRecentDays } from "./integrations/cleanupReisenCalendarSync";
import { WEATHER_ICON, WEATHER_LABEL } from "./weather/weatherUi";
import { registerTrack3dProcessor, mountTrack3dBlock, type Track3dBlockOptions } from "./tracks/track3dView";
import { registerWalkTrackEnrichment } from "./tracks/walkTrackEnrichment";
import { openPhotoLightbox, registerPhotoGalleryLightbox } from "./photos/photoLightbox";
import { registerJournalMetaPostProcessor } from "./notes/journalMetaPostProcessor";

function migrateCollapsed(raw: Partial<Record<string, boolean>> | undefined): Record<SectionId, boolean> {
  const merged = { ...DEFAULT_SECTIONS_COLLAPSED, ...raw };
  if (raw?.outline !== undefined && raw.timeline === undefined) {
    merged.timeline = raw.outline;
  }
  return merged;
}

function migrateOutline(
  loaded: Partial<UniversalDailyNoteSettings>["outline"],
): UniversalDailyNoteSettings["outline"] {
  const base = { ...DEFAULT_SETTINGS.outline, ...loaded };
  const excluded = base.excludedHeadings?.length
    ? base.excludedHeadings
    : DEFAULT_SETTINGS.outline.excludedHeadings;
  const rangeMode = base.rangeMode ?? DEFAULT_SETTINGS.outline.rangeMode;
  const journalHeading = normalizeActiveJournalHeading(base.journalHeading, excluded);
  const feedProfileFilters = migrateFeedProfileFilters(base, journalHeading);

  return {
    ...base,
    excludedHeadings: excluded,
    rangeMode,
    textFilterEnabled: base.textFilterEnabled ?? false,
    textFilterQuery: base.textFilterQuery ?? "",
    feedProfileFilters,
    includeRestOfTagebuch: base.includeRestOfTagebuch ?? false,
    feedContextFilter: base.feedContextFilter ?? "",
    journalHeading: DEFAULT_JOURNAL_HEADING,
  };
}

function migrateFeedProfileFilters(
  base: Partial<UniversalDailyNoteSettings>["outline"],
  journalHeading: string,
): FeedProfile[] {
  if (Array.isArray(base?.feedProfileFilters) && base.feedProfileFilters.length > 0) {
    return normalizeOutlineProfileFilters(base.feedProfileFilters);
  }
  const fromHeading = feedProfileForSectionHeading(journalHeading);
  if (fromHeading) return [fromHeading];
  const legacy = base?.feedProfileFilter;
  if (legacy && legacy !== "alle" && legacy !== "tagebuch") return [legacy];
  return [];
}

function mergeSettings(raw: Partial<UniversalDailyNoteSettings> | null): UniversalDailyNoteSettings {
  const loaded = raw ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...loaded,
    dailyNoteFallback: { ...DEFAULT_SETTINGS.dailyNoteFallback, ...loaded.dailyNoteFallback },
    tagebuchVerweise: { ...DEFAULT_SETTINGS.tagebuchVerweise, ...loaded.tagebuchVerweise },
    quickCapture: { ...DEFAULT_SETTINGS.quickCapture, ...loaded.quickCapture },
    calendarSync: { ...DEFAULT_SETTINGS.calendarSync, ...loaded.calendarSync },
    garminSync: { ...DEFAULT_SETTINGS.garminSync, ...loaded.garminSync },
    calendarLinkOverrides: { ...DEFAULT_SETTINGS.calendarLinkOverrides, ...loaded.calendarLinkOverrides },
    weatherCapture: { ...DEFAULT_SETTINGS.weatherCapture, ...loaded.weatherCapture },
    composerTemplates: { ...DEFAULT_SETTINGS.composerTemplates, ...loaded.composerTemplates },
    composerGroupLabels: { ...DEFAULT_SETTINGS.composerGroupLabels, ...loaded.composerGroupLabels },
    feedDetailLayout: { ...DEFAULT_SETTINGS.feedDetailLayout, ...loaded.feedDetailLayout },
    composerWindow: { ...DEFAULT_SETTINGS.composerWindow, ...loaded.composerWindow },
    composer: { ...DEFAULT_SETTINGS.composer, ...loaded.composer },
    wandernLayout: { ...DEFAULT_SETTINGS.wandernLayout, ...loaded.wandernLayout },
    spaziergangLayout: { ...DEFAULT_SETTINGS.spaziergangLayout, ...loaded.spaziergangLayout },
    tracks: { ...DEFAULT_SETTINGS.tracks, ...loaded.tracks },
    analytics: { ...DEFAULT_SETTINGS.analytics, ...loaded.analytics },
    outline: migrateOutline(loaded.outline),
    sections: {
      collapsed: migrateCollapsed(loaded.sections?.collapsed),
    },
  };
}

export default class UniversalDailyNotePlugin extends Plugin {
  settings!: UniversalDailyNoteSettings;
  /** Guard: auto-open composer at most once per calendar day (todayNoteOpen mode). */
  lastAutoComposerDateKey: string | null = null;
  /** Gallery lightbox with arrow navigation (also used from Dataview views). */
  openPhotoLightbox = openPhotoLightbox;
  /** GPX 3D block for Dataview Tagebuch views. */
  mountTrack3dBlock = (container: HTMLElement, options: Track3dBlockOptions) =>
    mountTrack3dBlock(this.app, container, options);

  async onload() {
    await this.loadSettings();

    registerTrack3dProcessor(this);
    registerWalkTrackEnrichment(this);
    registerPhotoGalleryLightbox(this);
    registerJournalMetaPostProcessor(this);

    this.registerView(VIEW_TYPE_DAILY_PANEL, (leaf) => new DailyPanelView(leaf, this));
    this.registerView(VIEW_TYPE_VERWEISE, (leaf) => new VerweisePanelView(leaf, this));

    this.addRibbonIcon("list-tree", "Tagebuch-Outline", async () => {
      await activateDailyPanel(this.app);
    });

    this.addRibbonIcon("link-2", "Tagebuch-Verweise", async () => {
      await activateVerweisePanel(this.app);
    });

    if (Platform.isMobile) {
      this.addRibbonIcon(COMPOSER_ICON, COMPOSER_LABEL, () => {
        openDailyComposer(this, { date: new Date() });
      });
    }

    this.addCommand({
      id: "open-daily-note-outline",
      name: "Tagebuch-Outline öffnen",
      callback: async () => {
        await activateDailyPanel(this.app);
      },
    });

    this.addCommand({
      id: "open-tagebuch-verweise",
      name: "Tagebuch-Verweise öffnen",
      callback: async () => {
        await activateVerweisePanel(this.app);
      },
    });

    this.addCommand({
      id: "open-daily-composer",
      name: `${COMPOSER_LABEL} öffnen`,
      icon: COMPOSER_ICON,
      callback: () => {
        openDailyComposer(this, { date: new Date() });
      },
    });

    this.addCommand({
      id: "open-daily-composer-for-active-note",
      name: `${COMPOSER_LABEL} (aktuelle Daily Note)`,
      icon: COMPOSER_ICON,
      checkCallback: (checking) => {
        const date = resolveComposerDateFromActiveFile(this);
        if (!date) return false;
        if (!checking) {
          this.openComposerForDate(date);
        }
        return true;
      },
    });

    if (Platform.isMobileApp) {
      this.addCommand({
        id: "open-daily-composer-mobile",
        name: COMPOSER_LABEL,
        icon: COMPOSER_ICON,
        mobileOnly: true,
        callback: () => {
          openDailyComposer(this, { date: new Date() });
        },
      });

      this.addCommand({
        id: "open-today-daily-note-composer",
        name: "Heutige Notiz im Composer öffnen",
        icon: COMPOSER_ICON,
        mobileOnly: true,
        callback: async () => {
          await openOrCreateDailyNoteForDate(this.app, new Date(), this.settings.dailyNoteFallback);
          scheduleAutoOpenComposerForToday(this);
        },
      });
    }

    const addComposerMenuItem = (menu: Menu, file: TFile): void => {
      const date = dateFromDailyNoteFile(
        file,
        this.settings.dailyNoteFallback,
        this.settings.tagebuchVerweise,
      );
      if (!date) return;
      menu.addItem((item) => {
        item
          .setTitle(COMPOSER_LABEL)
          .setIcon(COMPOSER_ICON)
          .onClick(() => {
            this.openComposerForDate(date);
          });
      });
    };

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, _editor, view) => {
        const file = view.file;
        if (file instanceof TFile) addComposerMenuItem(menu, file);
      }),
    );

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (file instanceof TFile) addComposerMenuItem(menu, file);
      }),
    );

    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file instanceof TFile) {
          maybeAutoOpenComposerForToday(this, "file-open", file);
        }
      }),
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (!leaf) return;
        const file = "file" in leaf.view ? leaf.view.file : null;
        if (file instanceof TFile) {
          maybeAutoOpenComposerForToday(this, "file-open", file);
        }
      }),
    );

    this.registerObsidianProtocolHandler("udn-composer", (params) => {
      const dateParam = params.date?.trim();
      let date = new Date();
      if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        const [y, m, d] = dateParam.split("-").map(Number);
        date = new Date(y, m - 1, d);
      }
      const heading = params.heading?.trim();
      openDailyComposer(this, {
        date,
        journalHeading: heading
          ? normalizeActiveJournalHeading(heading, this.settings.outline.excludedHeadings)
          : undefined,
        onHeadingChange: (h) => {
          this.settings.outline.journalHeading = h;
          void this.saveSettings();
        },
      });
    });

    this.addCommand({
      id: "insert-weather-location",
      name: WEATHER_LABEL,
      icon: WEATHER_ICON,
      callback: async () => {
        const date = resolveComposerDateFromActiveFile(this) ?? new Date();
        await runInsertWeather(this, date, this.settings.outline.journalHeading);
      },
    });

    this.addCommand({
      id: "sync-calendar-appointments",
      name: "Kalender-Termine ins Tagebuch übernehmen",
      icon: "calendar",
      callback: async () => {
        const date = resolveComposerDateFromActiveFile(this) ?? new Date();
        const added = await syncCalendarAppointmentsIntoDailyNote(this.app, {
          date,
          fallback: this.settings.dailyNoteFallback,
          settings: this.settings.calendarSync,
        });
        if (added > 0) {
          new Notice(`${added} Termin${added === 1 ? "" : "e"} übernommen.`);
        } else {
          new Notice("Keine neuen Termine.");
        }
      },
    });

    this.addCommand({
      id: "import-garmin-pending-activities",
      name: "Garmin-Aktivitäten aus pending.json importieren",
      icon: "footprints",
      callback: async () => {
        const imported = await importGarminPendingActivities(this.app, {
          settings: this.settings.garminSync,
          fallback: this.settings.dailyNoteFallback,
          wandernLayout: this.settings.wandernLayout,
          spaziergangLayout: this.settings.spaziergangLayout,
          dailyNotesFolder: this.settings.tagebuchVerweise.dailyNotesFolder,
        });
        if (imported > 0) {
          new Notice(`${imported} Garmin-Aktivität${imported === 1 ? "" : "en"} importiert.`);
        } else {
          new Notice("Keine neuen Garmin-Aktivitäten in pending.json.");
        }
      },
    });

    this.addCommand({
      id: "cleanup-reisen-calendar-sync",
      name: "Kalender-Termine aus Reisen bereinigen",
      icon: "brush",
      callback: async () => {
        const { files, removed, moved } = await cleanupReisenCalendarSyncForRecentDays(
          this.app,
          this.settings.dailyNoteFallback,
          this.settings.tagebuchVerweise,
          this.settings.outline.durationDays,
        );
        if (removed === 0) {
          new Notice("Keine Kalender-Termine in Reisen gefunden.");
          return;
        }
        new Notice(
          `${removed} Termin${removed === 1 ? "" : "e"} aus Reisen entfernt` +
            (moved > 0 ? `, ${moved} ins Tagebuch übernommen` : "") +
            (files > 1 ? ` (${files} Tage).` : "."),
        );
      },
    });

    this.addCommand({
      id: "open-today-daily-note",
      name: "Heutige Daily Note öffnen oder erstellen",
      callback: async () => {
        await openOrCreateDailyNoteForDate(this.app, new Date(), this.settings.dailyNoteFallback);
        maybeAutoOpenComposerForToday(this, "command");
      },
    });

    this.addCommand({
      id: "open-daily-note-for-date",
      name: "Daily Note für Datum öffnen oder erstellen…",
      callback: async () => {
        await openOrCreateDailyNoteForDate(this.app, new Date(), this.settings.dailyNoteFallback);
      },
    });

    this.addCommand({
      id: "migrate-daily-note-photos",
      name: "Daily-Note-Fotos nach Anhänge/Bilder migrieren",
      callback: async () => {
        const { migrateAllDailyNotePhotos } = await import("./notes/migrateDailyNotePhotos");
        const result = await migrateAllDailyNotePhotos(this.app);
        const msg = `${result.photosMoved} Foto(s) in ${result.filesUpdated} Notiz(en) verschoben.`;
        if (result.errors.length > 0) {
          console.warn("Universal Daily Note: Foto-Migration", result.errors);
          new Notice(`${msg} ${result.errors.length} Hinweis(e) in der Konsole.`);
        } else {
          new Notice(msg);
        }
      },
    });

    this.addSettingTab(new UniversalDailyNoteSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      if (this.settings.openPanelOnEnable) {
        void activateDailyPanel(this.app);
      }
      if (Platform.isDesktop && this.settings.garminSync.enabled && this.settings.garminSync.syncOnLoad) {
        void importGarminPendingActivities(this.app, {
          settings: this.settings.garminSync,
          fallback: this.settings.dailyNoteFallback,
          wandernLayout: this.settings.wandernLayout,
          spaziergangLayout: this.settings.spaziergangLayout,
          dailyNotesFolder: this.settings.tagebuchVerweise.dailyNotesFolder,
        }).then((imported) => {
          if (imported > 0) {
            new Notice(`${imported} Garmin-Aktivität${imported === 1 ? "" : "en"} importiert.`);
          }
        });
      }
    });
  }

  async loadSettings() {
    this.settings = mergeSettings(await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  /** Open composer for the active daily note, or false when the file is not a daily note. */
  openComposerForActiveDailyNote(file?: TFile | null): boolean {
    const date = resolveComposerDateFromActiveFile(this, file);
    if (!date) return false;
    this.openComposerForDate(date);
    return true;
  }

  /** Used by Universal Tasks Aufgaben-Composer to create/open daily notes. */
  async ensureDailyNoteForDate(date: Date): Promise<TFile> {
    return ensureDailyNoteFileForDate(this.app, date, this.settings.dailyNoteFallback);
  }

  /** Active daily note date for Universal Tasks context resolution. */
  resolveComposerDateFromFile(): Date | null {
    return resolveComposerDateFromActiveFile(this);
  }

  /** Called by Universal Calendar and other integrations. */
  openComposerForDate(
    date: Date,
    options?: {
      onSaved?: (date: Date) => void;
      focusEntryId?: string;
      focusEntryLine?: number;
      journalHeading?: string;
    },
  ): void {
    openDailyComposer(this, {
      date,
      journalHeading: options?.journalHeading ?? this.settings.outline.journalHeading,
      focusEntryId: options?.focusEntryId,
      focusEntryLine: options?.focusEntryLine,
      onSaved: (savedDate) => {
        options?.onSaved?.(savedDate);
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_DAILY_PANEL)) {
          if (leaf.view instanceof DailyPanelView) {
            leaf.view.pinOutlineDay(savedDate);
          }
        }
      },
      onDateChange: (d) => {
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_DAILY_PANEL)) {
          if (leaf.view instanceof DailyPanelView) {
            leaf.view.pinOutlineDay(d);
          }
        }
      },
      onHeadingChange: (heading) => {
        this.settings.outline.journalHeading = heading;
        void this.saveSettings();
      },
    });
  }
}
