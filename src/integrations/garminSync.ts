import type { App } from "obsidian";
import type { DailyNoteFallbackSettings, WandernLayoutSettings } from "../settings";
import { DEFAULT_JOURNAL_HEADING } from "../settings";
import {
  composerEntryText,
  loadComposerState,
  saveComposerState,
  type ComposerEntry,
} from "../notes/dailyComposer";
import { entryMetaFromProfile, generateEntryId, appendEntryMeta, parseEntryMetaComment } from "../notes/journalEntryMeta";
import {
  formatJournalEntryText,
  parseJournalEntryDisplay,
  sortJournalEntryTexts,
} from "../notes/parseJournalEntryDisplay";
import { mergeWalkStatsIntoBeschreibung } from "../notes/walkStatsBeschreibung";
import { formatTrackSummary } from "../tracks/gpxImport";
import { syncWandernSupplements } from "../notes/wandernComposer";
import { syncSpaziergangSupplements } from "../notes/spaziergangComposer";
import { garminCalendarSyncId } from "./garminCalendarFilter";
import { parseCalendarSyncId, stripCalendarSyncMarker } from "./calendarSyncMarker";
import {
  collectGarminSyncIds,
  parseGarminSyncId,
  withGarminSyncMarker,
} from "./garminSyncMarker";

export type GarminActivityProfile = "wandern" | "spaziergang";

export type GarminPendingActivity = {
  garminId: string;
  date: string;
  startTime: string;
  title: string;
  profile: GarminActivityProfile;
  gpxPath?: string;
  distanceKm?: number | null;
  durationSec?: number | null;
  elevationGainM?: number | null;
};

function parseActivityDate(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map((part) => Number(part));
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

function profilePrefix(profile: GarminActivityProfile): string {
  return profile === "wandern" ? "Wandern:" : "Spaziergang:";
}

/** Normalize titles for matching calendar `Termin:` lines to Garmin activities. */
export function normalizeGarminMatchTitle(title: string): string {
  return title
    .trim()
    .replace(/^Termin:\s*/i, "")
    .replace(/^🥾\s*|^🚶\s*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function activityBodyTitle(activity: GarminPendingActivity): string {
  const prefix = profilePrefix(activity.profile);
  const raw = activity.title.trim().replace(/^🥾\s*|^🚶\s*/g, "").trim();
  if (!raw) return prefix;
  const lowerRaw = raw.toLowerCase();
  const lowerPrefix = prefix.toLowerCase().replace(":", "");
  if (lowerRaw.startsWith(`${lowerPrefix}:`) || lowerRaw.startsWith(`${lowerPrefix} `)) {
    return raw;
  }
  return `${prefix} ${raw}`;
}

function trackSummaryFromActivity(activity: GarminPendingActivity): string {
  const parts: string[] = [];
  const summary = formatTrackSummary({
    path: activity.gpxPath ?? "",
    name: activity.gpxPath?.split("/").pop() ?? "",
    distanceKm: activity.distanceKm ?? null,
    durationSec: activity.durationSec ?? null,
    startLabel: null,
    endLabel: null,
  });
  if (summary) parts.push(summary);
  if (activity.elevationGainM != null && activity.elevationGainM > 0) {
    parts.push(`${Math.round(activity.elevationGainM)} m ↑`);
  }
  return parts.join(" · ");
}

function titlesMatchForGarminDedup(terminTitle: string, activity: GarminPendingActivity): boolean {
  const normalizedTermin = normalizeGarminMatchTitle(terminTitle);
  const normalizedActivity = normalizeGarminMatchTitle(activityBodyTitle(activity));
  if (!normalizedTermin || !normalizedActivity) return false;
  if (normalizedTermin === normalizedActivity) return true;
  if (normalizedTermin.includes(normalizedActivity) || normalizedActivity.includes(normalizedTermin)) {
    return true;
  }
  const prefix = profilePrefix(activity.profile).toLowerCase().replace(":", "");
  return normalizedTermin.startsWith(`${prefix}:`) && normalizedActivity.startsWith(`${prefix}:`);
}

/**
 * Remove generic calendar-sync `Termin:` lines that duplicate a Garmin activity
 * (same time + matching title, or same garmin CalDAV sync id).
 */
export function stripMatchingCalendarTerminEntries(
  entryTexts: string[],
  activity: GarminPendingActivity,
): string[] {
  const garminCalId = garminCalendarSyncId(activity.garminId);
  const targetTime = activity.startTime.trim();

  return entryTexts.filter((line) => {
    const calId = parseCalendarSyncId(line);
    if (calId === garminCalId) return false;

    const { time, body } = parseJournalEntryDisplay(line);
    if (!body.toLowerCase().startsWith("termin:")) return true;
    if (time?.trim() !== targetTime) return true;

    const terminTitle = stripCalendarSyncMarker(body);
    return !titlesMatchForGarminDedup(terminTitle, activity);
  });
}

export function buildGarminJournalLine(
  activity: GarminPendingActivity,
  preservedEntryId?: string,
): string {
  const bodyTitle = activityBodyTitle(activity);
  const body = withGarminSyncMarker(bodyTitle, activity.garminId);
  const entryId = preservedEntryId?.trim() || generateEntryId();
  const meta = entryMetaFromProfile(activity.profile, bodyTitle, entryId, entryId);
  const line = formatJournalEntryText(activity.startTime.trim(), body);
  return appendEntryMeta(line, meta);
}

/** Insert or replace the journal line for a Garmin activity (no duplicate udn-garmin id). */
export function mergeGarminJournalEntries(
  entryTexts: string[],
  activity: GarminPendingActivity,
): string[] {
  const garminId = activity.garminId.trim();
  const withoutTerminDupes = stripMatchingCalendarTerminEntries(entryTexts, activity);
  const hasExisting = collectGarminSyncIds(withoutTerminDupes).has(garminId);

  if (!hasExisting) {
    return sortJournalEntryTexts([...withoutTerminDupes, buildGarminJournalLine(activity)]);
  }

  let preservedEntryId: string | undefined;
  const replaced = withoutTerminDupes.map((line) => {
    if (parseGarminSyncId(line) !== garminId) return line;
    preservedEntryId = parseEntryMetaComment(line)?.id ?? preservedEntryId;
    return buildGarminJournalLine(activity, preservedEntryId);
  });
  return sortJournalEntryTexts(replaced);
}

export function findComposerEntryForGarminActivity(
  entries: ComposerEntry[],
  activity: GarminPendingActivity,
): ComposerEntry | undefined {
  const garminId = activity.garminId.trim();
  const byMarker = entries.find((entry) => entryMatchesGarminActivity(entry, garminId));
  if (byMarker) return byMarker;

  const bodyTitle = activityBodyTitle(activity);
  const activityCore = normalizeGarminMatchTitle(bodyTitle);
  const startTime = activity.startTime.trim();

  return entries.find((entry) => {
    if (entry.profile !== activity.profile) return false;
    if (startTime && entry.time.trim() && entry.time.trim() !== startTime) return false;
    const candidate = normalizeGarminMatchTitle(
      entry.context?.trim() || `${profilePrefix(activity.profile)} ${entry.body}`.trim(),
    );
    if (!candidate || !activityCore) return false;
    return (
      candidate === activityCore ||
      candidate.includes(activityCore) ||
      activityCore.includes(candidate)
    );
  });
}

function entryMatchesGarminActivity(entry: ComposerEntry, garminId: string): boolean {
  if (entry.garminSyncId === garminId) return true;
  return parseGarminSyncId(composerEntryText(entry)) === garminId;
}

export function enrichEntryForGarminImport(
  entry: ComposerEntry,
  activity: GarminPendingActivity,
): ComposerEntry {
  const kurz = trackSummaryFromActivity(activity);
  const statsSource = {
    distanceKm: activity.distanceKm,
    durationSec: activity.durationSec,
    elevationGainM: activity.elevationGainM,
  };
  const beschreibung = mergeWalkStatsIntoBeschreibung(entry.supplementDetail ?? "", statsSource);
  return {
    ...entry,
    garminSyncId: activity.garminId.trim(),
    profile: activity.profile,
    context: activityBodyTitle(activity),
    supplementKurz: kurz || entry.supplementKurz,
    supplementDetail: beschreibung,
    supplementTrackPath: activity.gpxPath?.trim() || entry.supplementTrackPath,
    entryId: entry.entryId ?? generateEntryId(),
  };
}

export type ImportGarminActivityOptions = {
  activity: GarminPendingActivity;
  fallback: DailyNoteFallbackSettings;
  wandernLayout: WandernLayoutSettings;
  spaziergangLayout: WandernLayoutSettings;
  dailyNotesFolder?: string;
};

/** Import one Garmin activity into ## Tagebuch (+ profile section), replacing duplicate Termin lines. */
export async function importGarminActivityIntoDailyNote(
  app: App,
  options: ImportGarminActivityOptions,
): Promise<boolean> {
  const { activity, fallback, wandernLayout, spaziergangLayout, dailyNotesFolder } = options;
  const date = parseActivityDate(activity.date);
  const heading = DEFAULT_JOURNAL_HEADING;

  const state = await loadComposerState(app, date, fallback, heading, dailyNotesFolder);
  const existing = state.entries.map(composerEntryText);
  const garminId = activity.garminId.trim();
  const matchedEntry = findComposerEntryForGarminActivity(state.entries, activity);

  const merged = mergeGarminJournalEntries(existing, activity);

  const journalChanged =
    merged.length !== existing.length || merged.some((line, index) => line !== existing[index]);
  const alreadyImported = collectGarminSyncIds(existing).has(garminId) || matchedEntry != null;
  if (!journalChanged && !alreadyImported) return false;

  if (journalChanged) {
    await saveComposerState(
      app,
      {
        file: state.file,
        journalHeading: heading,
        calloutTitle: state.calloutTitle,
        summary: state.summary,
        dateKey: state.dateKey,
        photos: state.photos,
      },
      merged,
    );
  }

  const refreshed = journalChanged
    ? await loadComposerState(app, date, fallback, heading, dailyNotesFolder)
    : state;
  const targetEntry =
    findComposerEntryForGarminActivity(refreshed.entries, activity) ?? matchedEntry;
  const syncEntries = refreshed.entries.map((entry) => {
    if (targetEntry) {
      if (entry.id !== targetEntry.id) return entry;
      return enrichEntryForGarminImport({ ...entry, garminSyncId: garminId }, activity);
    }
    if (!entryMatchesGarminActivity(entry, garminId)) return entry;
    return enrichEntryForGarminImport({ ...entry, garminSyncId: garminId }, activity);
  });

  const enrichedEntry = targetEntry
    ? syncEntries.find((entry) => entry.id === targetEntry.id)
    : syncEntries.find((entry) => entryMatchesGarminActivity(entry, garminId));
  if (!enrichedEntry) {
    console.warn("Universal Daily Note: Garmin-Import — kein Composer-Eintrag", {
      garminId,
      date: activity.date,
      file: state.file.path,
      entryCount: refreshed.entries.length,
    });
    return false;
  }

  if (activity.profile === "wandern") {
    await syncWandernSupplements(app, state.file, syncEntries, date, wandernLayout);
  } else {
    await syncSpaziergangSupplements(app, state.file, syncEntries, date, spaziergangLayout);
  }

  return true;
}
