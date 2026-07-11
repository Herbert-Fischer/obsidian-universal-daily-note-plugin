import type { FeedProfile, FeedProfileFilter } from "./notes/feedMetadata";

export type DailyNoteFallbackSettings = {
  folder: string;
  filenameFormat: string;
  templatePath: string | null;
};

export type TagebuchVerweiseSettings = {
  dailyNotesFolder: string;
  dailyNotesFileClass: string;
  showTimeBubbles: boolean;
};

export type CalendarSyncSettings = {
  enabled: boolean;
  includeTodos: boolean;
  /** Sync once per session when outline loads a day */
  syncOnOutlineLoad: boolean;
  /** Vault markdown files from Universal Calendar (by date / creation) */
  includeMarkdownNotes: boolean;
};

export type GarminSyncSettings = {
  enabled: boolean;
  /** Manifest written by universal-garmin-sync (host cron) */
  pendingManifestPath: string;
  /** Desktop: import pending activities on plugin load */
  syncOnLoad: boolean;
};

export type ComposerWindowSettings = {
  x: number | null;
  y: number | null;
};

export type ComposerAutoOpenMode = "never" | "todayCommand" | "todayNoteOpen";

export type ComposerSettings = {
  autoOpen: ComposerAutoOpenMode;
};

export type WandernLayoutSettings = {
  template: string;
  maxPhotos: number;
  track3dEnabled: boolean;
  track3dHeight: number;
  track3dElevationExaggeration: number;
  /** Base folder for Wandern photos: …/Bilder/<Callout-Titel>/ */
  photosFolder: string;
  /** Base folder for Wandern GPX: …/GPX/<Callout-Titel>.gpx */
  tracksFolder: string;
};

export type ComposerTemplatesSettings = {
  tagebuchBulkEnabled: boolean;
  reisenBulkEnabled: boolean;
  wandernBulkEnabled: boolean;
  spaziergangBulkEnabled: boolean;
  heizungBulkEnabled: boolean;
  lueftungBulkEnabled: boolean;
  /** Last Reisen trip label for callout title fallback */
  lastTripLabel: string;
};

/** User-managed composer group labels (e.g. Reise names). */
export type ComposerGroupLabelListSettings = {
  extra: string[];
  hidden: string[];
};

export type FeedDetailLayoutSettings = {
  heizungPhotosFolder: string;
  lueftungPhotosFolder: string;
  maxPhotos: number;
};

export type QuickCaptureSettings = {
  enabled: boolean;
  timeFormat: string;
  /** Used when syncHeadingWithOutline is false */
  headingPath: string | null;
  autoLinkActive: boolean;
  /** Category prefixes for formatted capture, e.g. "Mittagessen:" */
  entryPrefixes: string[];
  attachmentsFolder: string;
  syncHeadingWithOutline: boolean;
};

export type AnalyticsSettings = {
  enabled: boolean;
};

export type WeatherCaptureFormat = "line" | "callout" | "lineAndCallout";

export type WeatherCaptureSettings = {
  /** Frontmatter Location: setzen */
  updateFrontmatter: boolean;
  format: WeatherCaptureFormat;
  /** Zeit für Archiv-Einträge (HH:mm) */
  historicalTime: string;
  lastLocation: string;
};

export type SectionId = "timeline" | "capture" | "references" | "analytics";

export type SectionsSettings = {
  collapsed: Record<SectionId, boolean>;
};

import type { OutlineRangeMode } from "../integrations/calendarRange";

export type OutlineSettings = {
  durationDays: number;
  /** Active section shown in the outline */
  journalHeading: string;
  pageSize: number;
  showTimeBubbles: boolean;
  /** ## headings omitted from the section picker (e.g. Universal Tasks) */
  excludedHeadings: string[];
  /** scroll = paginated; month/week = bound to Universal Calendar */
  rangeMode: OutlineRangeMode;
  /** Show flexible text filter input */
  textFilterEnabled: boolean;
  /** Substring filter for entry lines (e.g. "Mittagessen:") */
  textFilterQuery: string;
  /** Active profile filters (empty = all). Replaces legacy feedProfileFilter. */
  feedProfileFilters: FeedProfile[];
  /** When filters are active, also show entries outside the selected profiles. */
  includeRestOfTagebuch: boolean;
  /** @deprecated Migrated to feedProfileFilters */
  feedProfileFilter?: FeedProfileFilter;
  /** Subfilter by feed context (trip, hike title, …) */
  feedContextFilter: string;
};

export const DEFAULT_JOURNAL_HEADING = "Tagebuch";

export const DEFAULT_EXCLUDED_JOURNAL_HEADINGS = ["Aufgaben", "Tasks"];

export type UniversalDailyNoteSettings = {
  dailyNoteFallback: DailyNoteFallbackSettings;
  tagebuchVerweise: TagebuchVerweiseSettings;
  quickCapture: QuickCaptureSettings;
  calendarSync: CalendarSyncSettings;
  garminSync: GarminSyncSettings;
  /** User-edited Termin text per calendar event id (vault-only, no CalDAV back-sync). */
  calendarLinkOverrides: Record<string, string>;
  weatherCapture: WeatherCaptureSettings;
  composerTemplates: ComposerTemplatesSettings;
  /** Extra/hidden group labels per profile (Reise, Wartung, …). */
  composerGroupLabels: Partial<Record<FeedProfile, ComposerGroupLabelListSettings>>;
  feedDetailLayout: FeedDetailLayoutSettings;
  composerWindow: ComposerWindowSettings;
  composer: ComposerSettings;
  wandernLayout: WandernLayoutSettings;
  spaziergangLayout: WandernLayoutSettings;
  analytics: AnalyticsSettings;
  outline: OutlineSettings;
  sections: SectionsSettings;
  openPanelOnEnable: boolean;
};

export const DEFAULT_SECTIONS_COLLAPSED: Record<SectionId, boolean> = {
  timeline: false,
  capture: true,
  references: false,
  analytics: true,
};

export const DEFAULT_SETTINGS: UniversalDailyNoteSettings = {
  dailyNoteFallback: {
    folder: "Daily",
    filenameFormat: "YYYY-MM-DD",
    templatePath: null,
  },
  tagebuchVerweise: {
    dailyNotesFolder: "Calendar/Notes",
    dailyNotesFileClass: "Daily Notes",
    showTimeBubbles: true,
  },
  quickCapture: {
    enabled: false,
    timeFormat: "HH:mm",
    headingPath: null,
    autoLinkActive: true,
    entryPrefixes: [
      "Mittagessen:",
      "Abendessen:",
      "Spaziergang:",
      "Termin:",
      "Besuch:",
      "Garten:",
      "Etappe:",
      "Highlight:",
      "Unterkunft:",
    ],
    attachmentsFolder: "Calendar/Attachments",
    syncHeadingWithOutline: true,
  },
  calendarSync: {
    enabled: true,
    includeTodos: false,
    syncOnOutlineLoad: true,
    includeMarkdownNotes: false,
  },
  garminSync: {
    enabled: true,
    pendingManifestPath: "Calendar/.garmin/pending.json",
    syncOnLoad: true,
  },
  calendarLinkOverrides: {},
  weatherCapture: {
    updateFrontmatter: true,
    format: "callout",
    historicalTime: "12:00",
    lastLocation: "",
  },
  composerTemplates: {
    tagebuchBulkEnabled: true,
    reisenBulkEnabled: true,
    wandernBulkEnabled: true,
    spaziergangBulkEnabled: true,
    heizungBulkEnabled: true,
    lueftungBulkEnabled: true,
    lastTripLabel: "",
  },
  composerGroupLabels: {},
  feedDetailLayout: {
    heizungPhotosFolder: "Calendar/Anhänge/Bilder",
    lueftungPhotosFolder: "Calendar/Anhänge/Bilder",
    maxPhotos: 6,
  },
  composerWindow: {
    x: null,
    y: null,
  },
  composer: {
    autoOpen: "todayCommand",
  },
  wandernLayout: {
    template: "",
    maxPhotos: 3,
    track3dEnabled: true,
    track3dHeight: 400,
    track3dElevationExaggeration: 4,
    photosFolder: "Calendar/Anhänge/Bilder",
    tracksFolder: "Calendar/Anhänge/GPX",
  },
  spaziergangLayout: {
    template: "",
    maxPhotos: 3,
    track3dEnabled: true,
    track3dHeight: 400,
    track3dElevationExaggeration: 4,
    photosFolder: "Calendar/Anhänge/Bilder",
    tracksFolder: "Calendar/Anhänge/GPX",
  },
  analytics: {
    enabled: false,
  },
  outline: {
    durationDays: 365,
    journalHeading: DEFAULT_JOURNAL_HEADING,
    pageSize: 10,
    showTimeBubbles: true,
    excludedHeadings: [...DEFAULT_EXCLUDED_JOURNAL_HEADINGS],
    rangeMode: "scroll",
    textFilterEnabled: false,
    textFilterQuery: "",
    feedProfileFilters: [],
    includeRestOfTagebuch: false,
    feedContextFilter: "",
  },
  sections: {
    collapsed: { ...DEFAULT_SECTIONS_COLLAPSED },
  },
  openPanelOnEnable: true,
};
