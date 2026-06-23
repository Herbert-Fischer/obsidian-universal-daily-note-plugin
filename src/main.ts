import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, DEFAULT_SECTIONS_COLLAPSED, type SectionId, type UniversalDailyNoteSettings } from "./settings";
import { normalizeActiveJournalHeading } from "./notes/journalHeadingFilter";
import { UniversalDailyNoteSettingTab } from "./settingsTab";
import { openOrCreateDailyNoteForDate } from "./notes/dailyNote";
import { DailyPanelView } from "./views/dailyPanelView";
import { VerweisePanelView } from "./views/verweisePanelView";
import { VIEW_TYPE_DAILY_PANEL, VIEW_TYPE_VERWEISE } from "./views/viewTypes";
import { activateDailyPanel } from "./views/activateDailyPanel";
import { activateVerweisePanel } from "./views/activateVerweisePanel";
import { openDailyComposer } from "./panel/composer/openDailyComposer";

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
  return {
    ...base,
    excludedHeadings: excluded,
    rangeMode,
    textFilterEnabled: base.textFilterEnabled ?? false,
    textFilterQuery: base.textFilterQuery ?? "",
    journalHeading: normalizeActiveJournalHeading(base.journalHeading, excluded),
  };
}

function mergeSettings(raw: Partial<UniversalDailyNoteSettings> | null): UniversalDailyNoteSettings {
  const loaded = raw ?? {};
  return {
    ...DEFAULT_SETTINGS,
    ...loaded,
    dailyNoteFallback: { ...DEFAULT_SETTINGS.dailyNoteFallback, ...loaded.dailyNoteFallback },
    tagebuchVerweise: { ...DEFAULT_SETTINGS.tagebuchVerweise, ...loaded.tagebuchVerweise },
    quickCapture: { ...DEFAULT_SETTINGS.quickCapture, ...loaded.quickCapture },
    analytics: { ...DEFAULT_SETTINGS.analytics, ...loaded.analytics },
    outline: migrateOutline(loaded.outline),
    sections: {
      collapsed: migrateCollapsed(loaded.sections?.collapsed),
    },
  };
}

export default class UniversalDailyNotePlugin extends Plugin {
  settings!: UniversalDailyNoteSettings;

  async onload() {
    await this.loadSettings();

    this.registerView(VIEW_TYPE_DAILY_PANEL, (leaf) => new DailyPanelView(leaf, this));
    this.registerView(VIEW_TYPE_VERWEISE, (leaf) => new VerweisePanelView(leaf, this));

    this.addRibbonIcon("list-tree", "Tagebuch-Outline", async () => {
      await activateDailyPanel(this.app);
    });

    this.addRibbonIcon("link-2", "Tagebuch-Verweise", async () => {
      await activateVerweisePanel(this.app);
    });

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
      name: "Tages-Composer öffnen",
      callback: () => {
        openDailyComposer(this, { date: new Date() });
      },
    });

    this.addCommand({
      name: "Heutige Daily Note öffnen oder erstellen",
      callback: async () => {
        await openOrCreateDailyNoteForDate(this.app, new Date(), this.settings.dailyNoteFallback);
      },
    });

    this.addCommand({
      id: "open-daily-note-for-date",
      name: "Daily Note für Datum öffnen oder erstellen…",
      callback: async () => {
        await openOrCreateDailyNoteForDate(this.app, new Date(), this.settings.dailyNoteFallback);
      },
    });

    this.addSettingTab(new UniversalDailyNoteSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      if (this.settings.openPanelOnEnable) {
        void activateDailyPanel(this.app);
      }
    });
  }

  async loadSettings() {
    this.settings = mergeSettings(await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
