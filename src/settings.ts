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
  /** HH:mm for all-day calendar items */
  allDayTime: string;
  includeTodos: boolean;
  /** Sync once per session when outline loads a day */
  syncOnOutlineLoad: boolean;
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
};

export const DEFAULT_JOURNAL_HEADING = "Tagebuch";

export const DEFAULT_EXCLUDED_JOURNAL_HEADINGS = ["Aufgaben", "Tasks"];

export type UniversalDailyNoteSettings = {
  dailyNoteFallback: DailyNoteFallbackSettings;
  tagebuchVerweise: TagebuchVerweiseSettings;
  quickCapture: QuickCaptureSettings;
  calendarSync: CalendarSyncSettings;
  weatherCapture: WeatherCaptureSettings;
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
      "Ankunft:",
      "Abfahrt:",
    ],
    attachmentsFolder: "Calendar/Attachments",
    syncHeadingWithOutline: true,
  },
  calendarSync: {
    enabled: true,
    allDayTime: "09:00",
    includeTodos: false,
    syncOnOutlineLoad: true,
  },
  weatherCapture: {
    updateFrontmatter: true,
    format: "callout",
    historicalTime: "12:00",
    lastLocation: "",
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
  },
  sections: {
    collapsed: { ...DEFAULT_SECTIONS_COLLAPSED },
  },
  openPanelOnEnable: true,
};
