import type { App } from "obsidian";
import type {
  CalendarSyncSettings,
  ComposerTemplatesSettings,
  DailyNoteFallbackSettings,
  TracksSettings,
} from "../settings";
import { addLocalDays } from "../panel/dateUtils";
import {
  buildChipEntryText,
  chipsForHeading,
  composerEntryText,
  type ComposerChip,
  type ComposerEntry,
} from "./dailyComposer";
import { parseJournalEntryDisplay } from "./parseJournalEntryDisplay";
import { parseCalendarSyncId, stripCalendarSyncMarker } from "../integrations/calendarSyncMarker";
import { mergeCalendarAppointmentTexts } from "../integrations/calendarAppointments";
import { appendWeatherToCalloutTitle } from "../weather/weatherFormat";
import { formatWeatherSummaryShort } from "../weather/weatherFormat";
import {
  fetchCurrentWeather,
  fetchHistoricalWeather,
  getCurrentPosition,
  reverseGeocode,
  searchGeocode,
  type GeoPlace,
} from "../weather/openMeteo";
import { sameLocalDay } from "../panel/dateUtils";
import { extractReisenTripFromSection, formatReisenCalloutTitle } from "./journalCallout";
import { ensureDailyNoteFileForDate } from "./appendLogLine";
import { findTracksForDay, formatTrackSummary, type TrackMatch } from "../tracks/gpxImport";

export type ComposerTemplateAction = "weather" | "calendar" | "photo" | "track" | "location";

export type ComposerTemplatePack = {
  id: string;
  label: string;
  headings: string[];
  kind: "bulk" | "single";
  chips?: ComposerChip[];
  actions?: ComposerTemplateAction[];
};

export const TYPISCHER_TAG_LABEL = "Typischer Tag";
export const TYPISCHER_REISETAG_LABEL = "Typischer Reisetag";
export const TYPISCHE_WANDERUNG_LABEL = "Typische Wanderung";
export const TYPISCHER_SPAZIERGANG_LABEL = "Typischer Spaziergang";

export const TAGEBUCH_BULK_CHIPS: ComposerChip[] = [
  { label: "Aufstehen", template: "Aufstehen", defaultTime: "07:30" },
  { label: "Mittagessen", template: "Mittagessen:", defaultTime: "12:00" },
  { label: "Spaziergang", template: "Spaziergang:", defaultTime: "11:00" },
];

export const REISEN_BULK_CHIPS: ComposerChip[] = [
  { label: "Abfahrt", template: "Abfahrt:", defaultTime: "10:00" },
  { label: "Etappe", template: "Etappe:", defaultTime: "12:00" },
  { label: "Highlight", template: "Highlight:", defaultTime: "15:00" },
  { label: "Ankunft", template: "Ankunft:", defaultTime: "18:00" },
  { label: "Unterkunft", template: "Unterkunft:", defaultTime: "19:00" },
];

export const WANDERN_BULK_CHIPS: ComposerChip[] = [
  { label: "Start", template: "Start:", defaultTime: "09:00" },
  { label: "Kurzbeschreibung", template: "Kurzbeschreibung:", defaultTime: "09:30" },
  { label: "Beschreibung", template: "Beschreibung:", defaultTime: "15:00" },
  { label: "Gipfel", template: "Gipfel:", defaultTime: "12:00" },
  { label: "Ende", template: "Ende:", defaultTime: "16:00" },
  { label: "Foto", template: "Foto:", defaultTime: "15:30" },
];

export const SPAZIERGANG_BULK_CHIPS: ComposerChip[] = [
  { label: "Start", template: "Start:", defaultTime: "09:00" },
  { label: "Kurzbeschreibung", template: "Kurzbeschreibung:", defaultTime: "09:30" },
  { label: "Beschreibung", template: "Beschreibung:", defaultTime: "15:00" },
  { label: "Highlight", template: "Highlight:", defaultTime: "12:00" },
  { label: "Ende", template: "Ende:", defaultTime: "16:00" },
  { label: "Foto", template: "Foto:", defaultTime: "15:30" },
];

export const HEIZUNG_BULK_CHIPS: ComposerChip[] = [
  { label: "Störung", template: "Störung:", defaultTime: "12:00" },
  { label: "Wartung", template: "Wartung:", defaultTime: "10:00" },
  { label: "Foto", template: "Foto:", defaultTime: "12:30" },
];

export const LUEFTUNG_BULK_CHIPS: ComposerChip[] = [
  { label: "Filter", template: "Filter:", defaultTime: "10:00" },
  { label: "Wartung", template: "Wartung:", defaultTime: "11:00" },
  { label: "Foto", template: "Foto:", defaultTime: "12:30" },
];

export const COMPOSER_TEMPLATE_PACKS: ComposerTemplatePack[] = [
  {
    id: "tagebuch-bulk",
    label: TYPISCHER_TAG_LABEL,
    headings: ["Tagebuch"],
    kind: "bulk",
    chips: TAGEBUCH_BULK_CHIPS,
    actions: ["weather", "calendar"],
  },
  {
    id: "reisen-bulk",
    label: TYPISCHER_REISETAG_LABEL,
    headings: ["Reisen"],
    kind: "bulk",
    chips: REISEN_BULK_CHIPS,
    actions: ["location", "track", "photo"],
  },
  {
    id: "wandern-bulk",
    label: TYPISCHE_WANDERUNG_LABEL,
    headings: ["Wandern"],
    kind: "bulk",
    chips: WANDERN_BULK_CHIPS,
    actions: ["location", "track", "photo"],
  },
  {
    id: "spaziergang-bulk",
    label: TYPISCHER_SPAZIERGANG_LABEL,
    headings: ["Spaziergang"],
    kind: "bulk",
    chips: SPAZIERGANG_BULK_CHIPS,
    actions: ["location", "track", "photo"],
  },
  {
    id: "heizung-bulk",
    label: "Typischer Heizungseintrag",
    headings: ["Heizung"],
    kind: "bulk",
    chips: HEIZUNG_BULK_CHIPS,
    actions: ["photo"],
  },
  {
    id: "lueftung-bulk",
    label: "Typischer Lüftungseintrag",
    headings: ["Lüftung"],
    kind: "bulk",
    chips: LUEFTUNG_BULK_CHIPS,
    actions: ["photo"],
  },
];

const WEATHER_TITLE_PATTERN = /[°℃]|☀|⛅|🌤|🌥|☁|🌦|🌧|⛈|🌩|❄|🌨|💨/;

export function headingMatchesPack(heading: string, pack: ComposerTemplatePack): boolean {
  const h = heading.trim().toLowerCase();
  return pack.headings.some((p) => p.toLowerCase() === h);
}

export function templatesForHeading(
  heading: string,
  settings: ComposerTemplatesSettings,
): ComposerTemplatePack[] {
  return COMPOSER_TEMPLATE_PACKS.filter((pack) => {
    if (!headingMatchesPack(heading, pack)) return false;
    if (pack.id === "tagebuch-bulk" && !settings.tagebuchBulkEnabled) return false;
    if (pack.id === "reisen-bulk" && !settings.reisenBulkEnabled) return false;
    if (pack.id === "wandern-bulk" && !settings.wandernBulkEnabled) return false;
    if (pack.id === "spaziergang-bulk" && !settings.spaziergangBulkEnabled) return false;
    if (pack.id === "heizung-bulk" && !settings.heizungBulkEnabled) return false;
    if (pack.id === "lueftung-bulk" && !settings.lueftungBulkEnabled) return false;
    return true;
  });
}

export function entryBodyPrefix(body: string): string {
  const trimmed = body.trim();
  const colon = trimmed.indexOf(":");
  if (colon >= 0) return trimmed.slice(0, colon + 1).toLowerCase();
  if (/^aufstehen$/i.test(trimmed)) return "aufstehen";
  return trimmed.split(/\s+/)[0]?.toLowerCase() ?? "";
}

export function entryHasPrefix(entry: Pick<ComposerEntry, "body">, prefix: string): boolean {
  const p = prefix.trim().toLowerCase();
  if (!p) return false;
  const bodyPrefix = entryBodyPrefix(entry.body);
  if (p.endsWith(":")) return bodyPrefix === p;
  return bodyPrefix === p || bodyPrefix === `${p}:`;
}

export function entriesHavePrefix(entries: ComposerEntry[], prefix: string): boolean {
  return entries.some((e) => entryHasPrefix(e, prefix));
}

export function calloutTitleHasWeather(title: string): boolean {
  return WEATHER_TITLE_PATTERN.test(title);
}

export function appendLocationToCalloutTitle(existing: string, placeName: string): string {
  const place = placeName.split(",")[0]?.trim() || placeName.trim();
  if (!place) return existing.trim();
  const trimmed = existing.trim();
  if (!trimmed) return place;
  if (trimmed.includes(place)) return trimmed;
  return `${trimmed} · ${place}`;
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function buildWeatherShort(place: GeoPlace, date: Date): Promise<string> {
  const dateKey = localDateKey(date);
  const isToday = sameLocalDay(date, new Date());
  if (isToday) {
    const current = await fetchCurrentWeather(place.latitude, place.longitude);
    return formatWeatherSummaryShort({
      placeName: place.placeName,
      dateKey,
      isHistorical: false,
      temperatureC: current.temperatureC,
      weatherCode: current.weatherCode,
      windKmh: current.windKmh,
    });
  }
  const historical = await fetchHistoricalWeather(place.latitude, place.longitude, dateKey);
  return formatWeatherSummaryShort({
    placeName: place.placeName,
    dateKey,
    isHistorical: true,
    tempMin: historical.tempMin,
    tempMax: historical.tempMax,
    weatherCode: historical.weatherCode,
    windKmh: historical.windKmh,
  });
}

async function resolvePlaceForWeather(
  date: Date,
  lastLocation: string,
): Promise<GeoPlace | null> {
  const isToday = sameLocalDay(date, new Date());
  if (isToday) {
    try {
      const pos = await getCurrentPosition();
      const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      if (!place.placeName.includes("°")) return place;
    } catch {
      /* fall through */
    }
  }
  const query = lastLocation.trim();
  if (!query) return null;
  return searchGeocode(query);
}

export async function resolveReisenTripLabel(
  app: App,
  date: Date,
  fallback: DailyNoteFallbackSettings,
  lastTripLabel: string,
): Promise<string | null> {
  try {
    const file = await ensureDailyNoteFileForDate(app, date, fallback);
    const text = await app.vault.read(file);
    const fromToday = extractReisenTripFromSection(text.split("\n"), "Reisen");
    if (fromToday) return fromToday;
  } catch {
    /* ignore */
  }

  try {
    const prev = addLocalDays(date, -1);
    const prevFile = await ensureDailyNoteFileForDate(app, prev, fallback);
    const prevText = await app.vault.read(prevFile);
    const fromPrev = extractReisenTripFromSection(prevText.split("\n"), "Reisen");
    if (fromPrev) return fromPrev;
  } catch {
    /* ignore */
  }

  const last = lastTripLabel.trim();
  return last || null;
}

export function chipEntriesToAdd(
  chips: ComposerChip[],
  existing: ComposerEntry[],
  onlyMissing: boolean,
): ComposerEntry[] {
  const additions: ComposerEntry[] = [];
  for (const chip of chips) {
    if (onlyMissing && entriesHavePrefix(existing, chip.template)) continue;
    const time = chip.defaultTime ?? "12:00";
    const { time: entryTime, body } = parseJournalEntryDisplay(buildChipEntryText(chip, time));
    additions.push({
      id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      line: -1,
      time: entryTime ?? time,
      body,
      rawLine: `- ${buildChipEntryText(chip, time)}`,
    });
  }
  return additions;
}

export function mergeComposerEntries(
  existing: ComposerEntry[],
  additions: ComposerEntry[],
): ComposerEntry[] {
  return [...existing, ...additions];
}

export function applyTrackToPrefixEntry(
  entries: ComposerEntry[],
  track: TrackMatch,
  prefix: string,
): ComposerEntry[] {
  const normalizedPrefix = prefix.trim().endsWith(":") ? prefix.trim() : `${prefix.trim()}:`;
  const summary = formatTrackSummary(track);
  const linkBody = `${summary} · [[${track.path}|Track]]`;
  const defaultTime = normalizedPrefix.toLowerCase() === "track:" ? "15:00" : "12:00";
  let updated = false;
  const next = entries.map((entry) => {
    if (updated || !entryHasPrefix(entry, normalizedPrefix)) return entry;
    if (entry.body.trim().length > normalizedPrefix.length) return entry;
    updated = true;
    return { ...entry, body: `${normalizedPrefix} ${linkBody}` };
  });
  if (updated) return next;
  return [
    ...next,
    {
      id: `tpl-track-${Date.now()}`,
      line: -1,
      time: defaultTime,
      body: `${normalizedPrefix} ${linkBody}`,
      rawLine: `- ${defaultTime} ${normalizedPrefix} ${linkBody}`,
    },
  ];
}

/** @deprecated Use applyTrackToPrefixEntry with "Etappe:" */
export function applyTrackToEtappeEntry(
  entries: ComposerEntry[],
  track: TrackMatch,
): ComposerEntry[] {
  return applyTrackToPrefixEntry(entries, track, "Etappe:");
}

function trackPrefixForPack(pack: ComposerTemplatePack): string {
  return pack.id === "wandern-bulk" ? "Track:" : "Etappe:";
}

export type ApplyBulkTemplateOptions = {
  app: App;
  date: Date;
  fallback: DailyNoteFallbackSettings;
  heading: string;
  entries: ComposerEntry[];
  calloutTitle: string;
  calendarSync: CalendarSyncSettings;
  templateSettings: ComposerTemplatesSettings;
  tracksSettings: TracksSettings;
  lastLocation: string;
  filePath?: string;
  linkOverrides?: Record<string, string>;
  onlyMissing: boolean;
  includePhoto: boolean;
  photoEmbed?: string;
  selectedTrack?: TrackMatch | null;
};

export type ApplyBulkTemplateResult = {
  entries: ComposerEntry[];
  calloutTitle: string;
  lastLocation: string;
  lastTripLabel: string;
};

export async function applyBulkTemplate(
  pack: ComposerTemplatePack,
  options: ApplyBulkTemplateOptions,
): Promise<ApplyBulkTemplateResult> {
  let entries = [...options.entries];
  let calloutTitle = options.calloutTitle;
  let lastLocation = options.lastLocation;
  let lastTripLabel = options.templateSettings.lastTripLabel;

  const actions = pack.actions ?? [];
  const chips = pack.chips ?? [];

  if (pack.id === "reisen-bulk") {
    const tripLabel = await resolveReisenTripLabel(
      options.app,
      options.date,
      options.fallback,
      lastTripLabel,
    );
    if (tripLabel) {
      lastTripLabel = tripLabel;
      const formatted = formatReisenCalloutTitle(tripLabel);
      if (!calloutTitle.trim() || calloutTitle.trim().toLowerCase() === "reisen") {
        calloutTitle = formatted;
      }
    }
  }

  if (actions.includes("weather") && !calloutTitleHasWeather(calloutTitle)) {
    const place = await resolvePlaceForWeather(options.date, lastLocation);
    if (place) {
      const weatherShort = await buildWeatherShort(place, options.date);
      calloutTitle = appendWeatherToCalloutTitle(calloutTitle, weatherShort);
      lastLocation = place.placeName;
    }
  }

  if (actions.includes("location")) {
    try {
      const pos = await getCurrentPosition();
      const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      if (!place.placeName.includes("°")) {
        calloutTitle = appendLocationToCalloutTitle(calloutTitle, place.placeName);
        lastLocation = place.placeName;
      }
    } catch {
      const query = lastLocation.trim();
      if (query) calloutTitle = appendLocationToCalloutTitle(calloutTitle, query);
    }
  }

  const chipAdds = chipEntriesToAdd(chips, entries, options.onlyMissing);
  entries = mergeComposerEntries(entries, chipAdds);

  if (actions.includes("calendar") && options.heading.trim().toLowerCase() === "tagebuch") {
    if (options.calendarSync.enabled) {
      const existingTexts = new Set(entries.map(composerEntryText));
      const merged = mergeCalendarAppointmentTexts(options.app, options.date, [...existingTexts], {
        settings: options.calendarSync,
        sourcePath: options.filePath ?? "",
        linkOverrides: options.linkOverrides ?? {},
      });
      for (const text of merged) {
        if (existingTexts.has(text)) continue;
        const { time, body } = parseJournalEntryDisplay(text);
        const calId = parseCalendarSyncId(text) ?? undefined;
        entries.push({
          id: calId ? `cal-${calId}` : `tpl-cal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          line: -1,
          time: time ?? "",
          body: stripCalendarSyncMarker(body),
          rawLine: `- ${text}`,
          calendarId: calId,
        });
        existingTexts.add(text);
      }
    }
  }

  if (actions.includes("track") && options.tracksSettings.enabled) {
    const trackPrefix = trackPrefixForPack(pack);
    const tracks = options.selectedTrack
      ? [options.selectedTrack]
      : await findTracksForDay(options.app, options.date, options.tracksSettings);
    if (tracks.length === 1) {
      entries = applyTrackToPrefixEntry(entries, tracks[0]!, trackPrefix);
    } else if (tracks.length > 1 && options.selectedTrack) {
      entries = applyTrackToPrefixEntry(entries, options.selectedTrack, trackPrefix);
    }
  }

  if (options.includePhoto && options.photoEmbed) {
    if (pack.id === "wandern-bulk") {
      if (!entriesHavePrefix(entries, "Foto:")) {
        entries.push({
          id: `tpl-photo-${Date.now()}`,
          line: -1,
          time: "15:30",
          body: `Foto: ${options.photoEmbed}`,
          rawLine: `- 15:30 Foto: ${options.photoEmbed}`,
        });
      }
    } else if (!entriesHavePrefix(entries, "Foto:")) {
      entries.push({
        id: `tpl-photo-${Date.now()}`,
        line: -1,
        time: "14:00",
        body: options.photoEmbed,
        rawLine: `- 14:00 ${options.photoEmbed}`,
      });
    }
  }

  return { entries, calloutTitle, lastLocation, lastTripLabel };
}

export function shouldConfirmBulkApply(entries: ComposerEntry[]): boolean {
  return entries.length > 0;
}
