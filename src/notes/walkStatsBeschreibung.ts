import type { TrackMatch } from "../tracks/gpxImport";
import { formatDuration } from "../tracks/gpxImport";

export type WalkStatsSource = {
  distanceKm?: number | null;
  durationSec?: number | null;
  elevationGainM?: number | null;
};

export function beschreibungHasWalkStats(beschreibung: string): boolean {
  const text = beschreibung.trim();
  if (!text) return false;
  return /Streckenlänge:/i.test(text) && /Dauer:/i.test(text);
}

/** Sichtbare Callout-Zeilen (Streckenlänge / Dauer / Höhenmeter). */
export function formatWalkStatsLines(source: WalkStatsSource): string {
  const lines: string[] = [];
  if (source.distanceKm != null) {
    lines.push(`Streckenlänge: ${source.distanceKm.toLocaleString("de-DE")} km`);
  }
  const dur = formatDuration(source.durationSec ?? null);
  if (dur) {
    if (/^\d{1,2}:\d{2}\s*h$/i.test(dur)) {
      lines.push(`Dauer: ${dur.replace(/\s*h$/i, "")} Std`);
    } else {
      lines.push(`Dauer: ${dur}`);
    }
  }
  if (source.elevationGainM != null && source.elevationGainM > 0) {
    lines.push(`Höhenmeter: ${Math.round(source.elevationGainM)} m`);
  }
  return lines.join("\n");
}

/** Garmin-Stats vorhandenen Beschreibungstext voranstellen, wenn noch keine Stats drinstehen. */
export function mergeWalkStatsIntoBeschreibung(
  beschreibung: string,
  source: WalkStatsSource,
): string {
  const stats = formatWalkStatsLines(source);
  if (!stats) return beschreibung;
  const existing = beschreibung.trim();
  if (!existing) return stats;
  if (beschreibungHasWalkStats(existing)) return existing;
  return `${stats}\n\n${existing}`;
}

/** Sichtbare Callout-Zeilen wie im Tages-Composer (Streckenlänge / Dauer). */
export function formatWalkStatsBeschreibungFromKurz(kurz: string): string {
  const raw = kurz.trim();
  if (!raw) return "";

  const lines: string[] = [];
  const kmMatch = raw.match(/([\d,.]+)\s*km\b/i);
  if (kmMatch?.[1]) {
    lines.push(`Streckenlänge: ${kmMatch[1]}`);
  }

  const clockMatch = raw.match(/(\d{1,2}:\d{2})\s*(?:h|Std)?\b/i);
  if (clockMatch?.[1]) {
    lines.push(`Dauer: ${clockMatch[1]} Std`);
  } else {
    const minMatch = raw.match(/(\d+)\s*min\b/i);
    if (minMatch?.[1]) {
      lines.push(`Dauer: ${minMatch[1]} min`);
    }
  }

  return lines.join("\n");
}

export function formatWalkStatsBeschreibungFromTrack(track: TrackMatch): string {
  const lines: string[] = [];
  if (track.distanceKm != null) {
    lines.push(`Streckenlänge: ${track.distanceKm.toLocaleString("de-DE")}`);
  }
  const dur = formatDuration(track.durationSec);
  if (dur) {
    if (/^\d{1,2}:\d{2}\s*h$/i.test(dur)) {
      lines.push(`Dauer: ${dur.replace(/\s*h$/i, "")} Std`);
    } else {
      lines.push(`Dauer: ${dur}`);
    }
  }
  return lines.join("\n");
}

/** Beschreibung für Callout: vorhandener Text, sonst aus `kurz` oder Track-Stats. */
export function resolveWalkBeschreibung(
  beschreibung: string,
  kurz: string,
  track?: TrackMatch | null,
): string {
  const existing = beschreibung.trim();
  if (existing) return existing;

  const fromKurz = formatWalkStatsBeschreibungFromKurz(kurz);
  if (fromKurz) return fromKurz;

  if (track && (track.distanceKm != null || track.durationSec != null)) {
    return formatWalkStatsBeschreibungFromTrack(track);
  }

  return "";
}
