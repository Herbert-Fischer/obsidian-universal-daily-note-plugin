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
    showTimeBubbles: false,
  },
  quickCapture: {
    enabled: false,
    timeFormat: "HH:mm",
    headingPath: null,
    autoLinkActive: true,
    entryPrefixes: ["Mittagessen:", "Spaziergang:", "Ankunft:", "Abfahrt:"],
    attachmentsFolder: "Calendar/Attachments",
    syncHeadingWithOutline: true,
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
