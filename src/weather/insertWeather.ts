import type { App, TFile } from "obsidian";
import type { DailyNoteFallbackSettings, WeatherCaptureSettings } from "../settings";
import { ensureDailyNoteFileForDate, ensureSectionHeading } from "../notes/appendLogLine";
import {
  composerEntryText,
  loadComposerState,
  saveComposerState,
} from "../notes/dailyComposer";
import { upsertManagedCalloutTitle } from "../notes/journalCallout";
import { sameLocalDay } from "../panel/dateUtils";
import {
  fetchCurrentWeather,
  fetchHistoricalWeather,
  getCurrentPosition,
  reverseGeocode,
  searchGeocode,
  type GeoPlace,
} from "./openMeteo";
import { promptWeatherLocation } from "./WeatherLocationModal";
import {
  appendWeatherToCalloutTitle,
  formatLocationFrontmatter,
  formatWeatherSummaryShort,
  type WeatherSnapshot,
} from "./weatherFormat";

export type InsertWeatherOptions = {
  date: Date;
  fallback: DailyNoteFallbackSettings;
  journalHeading: string;
  settings: WeatherCaptureSettings;
  timeFormat?: string;
  /** Skip GPS even for today (always prompt). */
  manualLocation?: string;
};

export type InsertWeatherResult = {
  file: TFile;
  snapshot: WeatherSnapshot;
  place: GeoPlace;
};

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function updateLocationInContent(content: string, locationValue: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(content);
  if (!match) return content;
  let fm = match[1] ?? "";
  const body = match[2] ?? "";
  const line = `Location: ${locationValue}`;
  if (/^Location:/m.test(fm)) {
    fm = fm.replace(/^Location:.*$/m, line);
  } else {
    fm = `${fm.trimEnd()}\n${line}`;
  }
  return `---\n${fm}\n---\n${body}`;
}

async function resolvePlace(
  app: App,
  date: Date,
  settings: WeatherCaptureSettings,
  manualLocation?: string,
): Promise<GeoPlace> {
  if (manualLocation?.trim()) {
    const hit = await searchGeocode(manualLocation.trim());
    if (!hit) throw new Error(`Ort „${manualLocation.trim()}“ nicht gefunden.`);
    return hit;
  }

  const isToday = sameLocalDay(date, new Date());
  if (isToday) {
    try {
      const pos = await getCurrentPosition();
      const place = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
      if (!place.placeName.includes("°")) return place;
    } catch {
      /* fall through to prompt */
    }
  }

  const query = await promptWeatherLocation(app, {
    date,
    defaultLocation: settings.lastLocation,
    requireInput: !isToday,
  });
  if (!query) throw new Error("Abgebrochen.");
  const hit = await searchGeocode(query);
  if (!hit) throw new Error(`Ort „${query}“ nicht gefunden.`);
  return hit;
}

async function buildSnapshot(
  place: GeoPlace,
  date: Date,
): Promise<WeatherSnapshot> {
  const dateKey = localDateKey(date);
  const isToday = sameLocalDay(date, new Date());

  if (isToday) {
    const current = await fetchCurrentWeather(place.latitude, place.longitude);
    return {
      placeName: place.placeName,
      dateKey,
      isHistorical: false,
      temperatureC: current.temperatureC,
      weatherCode: current.weatherCode,
      windKmh: current.windKmh,
    };
  }

  const historical = await fetchHistoricalWeather(place.latitude, place.longitude, dateKey);
  return {
    placeName: place.placeName,
    dateKey,
    isHistorical: true,
    tempMin: historical.tempMin,
    tempMax: historical.tempMax,
    weatherCode: historical.weatherCode,
    windKmh: historical.windKmh,
  };
}

export async function insertWeatherIntoDailyNote(
  app: App,
  options: InsertWeatherOptions,
): Promise<InsertWeatherResult> {
  const heading = options.journalHeading.trim() || "Tagebuch";
  const place = await resolvePlace(app, options.date, options.settings, options.manualLocation);
  const snapshot = await buildSnapshot(place, options.date);

  const file = await ensureDailyNoteFileForDate(app, options.date, options.fallback);
  const weatherShort = formatWeatherSummaryShort(snapshot);

  if (options.settings.updateFrontmatter) {
    const loc = formatLocationFrontmatter(snapshot.placeName);
    if (loc) {
      await app.vault.process(file, (data) => updateLocationInContent(data, loc));
    }
  }

  const state = await loadComposerState(app, options.date, options.fallback, heading);
  const calloutTitle = appendWeatherToCalloutTitle(state.calloutTitle, weatherShort);
  const entryTexts = state.entries.map(composerEntryText);

  if (entryTexts.length > 0) {
    await saveComposerState(
      app,
      {
        file: state.file,
        journalHeading: state.journalHeading,
        calloutTitle,
        summary: state.summary,
        dateKey: state.dateKey,
      },
      entryTexts,
    );
  } else {
    await app.vault.process(state.file, (data) => {
      let lines = data.split("\n");
      lines = ensureSectionHeading(lines, heading);
      lines = upsertManagedCalloutTitle(lines, heading, calloutTitle, options.date);
      const content = lines.join("\n");
      return content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
    });
  }

  options.settings.lastLocation = place.placeName;

  return { file, snapshot, place };
}

export const WEATHER_VORLAGE_LABEL = "Wetter & Ort";
