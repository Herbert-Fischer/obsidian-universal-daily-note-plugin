import { TFile, type App, type TAbstractFile } from "obsidian";

export type TrackMatch = {
  path: string;
  name: string;
  distanceKm: number | null;
  durationSec: number | null;
  startLabel: string | null;
  endLabel: string | null;
};

type GpxPoint = { lat: number; lon: number; ele: number | null; time?: Date };

export type GpxTrackPoint = { lat: number; lon: number; ele: number | null };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function dateKeyForDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function haversineKm(a: GpxPoint, b: GpxPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function parseGpxTime(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseTrackPoints(xml: string): GpxPoint[] {
  const points: GpxPoint[] = [];
  const trkptRe = /<trkpt[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/gi;
  let m: RegExpExecArray | null;
  while ((m = trkptRe.exec(xml)) !== null) {
    const lat = parseFloat(m[1]!);
    const lon = parseFloat(m[2]!);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    const inner = m[3] ?? "";
    const timeMatch = /<time>([^<]+)<\/time>/i.exec(inner);
    const eleMatch = /<ele>([^<]+)<\/ele>/i.exec(inner);
    const eleRaw = eleMatch?.[1] ? parseFloat(eleMatch[1]) : NaN;
    points.push({
      lat,
      lon,
      ele: Number.isNaN(eleRaw) ? null : eleRaw,
      time: parseGpxTime(timeMatch?.[1]),
    });
  }
  if (points.length > 0) return points;

  const rteptRe = /<rtept[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*>([\s\S]*?)<\/rtept>/gi;
  while ((m = rteptRe.exec(xml)) !== null) {
    const lat = parseFloat(m[1]!);
    const lon = parseFloat(m[2]!);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    const inner = m[3] ?? "";
    const timeMatch = /<time>([^<]+)<\/time>/i;
    const tm = timeMatch.exec(inner);
    const eleMatch = /<ele>([^<]+)<\/ele>/i.exec(inner);
    const eleRaw = eleMatch?.[1] ? parseFloat(eleMatch[1]) : NaN;
    points.push({
      lat,
      lon,
      ele: Number.isNaN(eleRaw) ? null : eleRaw,
      time: parseGpxTime(tm?.[1]),
    });
  }
  return points;
}

export function parseGpxTrackPoints(xml: string): GpxTrackPoint[] {
  return parseTrackPoints(xml).map(({ lat, lon, ele }) => ({ lat, lon, ele }));
}

export function parseGpxStats(xml: string): {
  distanceKm: number | null;
  durationSec: number | null;
  start: GpxPoint | null;
  end: GpxPoint | null;
} {
  const points = parseTrackPoints(xml);
  if (points.length === 0) {
    return { distanceKm: null, durationSec: null, start: null, end: null };
  }

  let distanceM = 0;
  for (let i = 1; i < points.length; i++) {
    distanceM += haversineKm(points[i - 1]!, points[i]!) * 1000;
  }

  const start = points[0] ?? null;
  const end = points[points.length - 1] ?? null;
  let durationSec: number | null = null;
  if (start?.time && end?.time) {
    durationSec = Math.max(0, Math.round((end.time.getTime() - start.time.getTime()) / 1000));
  }

  return {
    distanceKm: distanceM > 0 ? Math.round((distanceM / 1000) * 10) / 10 : null,
    durationSec,
    start,
    end,
  };
}

function formatCoord(p: GpxPoint | null): string | null {
  if (!p) return null;
  return `${p.lat.toFixed(4)}°, ${p.lon.toFixed(4)}°`;
}

export function formatDuration(sec: number | null): string | null {
  if (sec == null || sec <= 0) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")} h`;
  return `${m} min`;
}

export function formatTrackSummary(track: TrackMatch): string {
  const parts: string[] = [];
  if (track.distanceKm != null) parts.push(`${track.distanceKm.toLocaleString("de-DE")} km`);
  const dur = formatDuration(track.durationSec);
  if (dur) parts.push(dur);
  if (parts.length === 0) return track.name.replace(/\.(gpx|tcx)$/i, "");
  return parts.join(" · ");
}

function fileMatchesDate(name: string, dateKey: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes(dateKey) && /\.(gpx|tcx)$/i.test(lower);
}

function collectTrackFiles(folder: TAbstractFile, dateKey: string, out: TFile[]): void {
  if (!("children" in folder) || !folder.children) return;
  for (const child of folder.children) {
    if (child instanceof TFile) {
      if (fileMatchesDate(child.name, dateKey)) out.push(child);
    } else if ("children" in child) {
      collectTrackFiles(child, dateKey, out);
    }
  }
}

function collectAllTrackFiles(folder: TAbstractFile, out: TFile[]): void {
  if (!("children" in folder) || !folder.children) return;
  for (const child of folder.children) {
    if (child instanceof TFile) {
      if (/\.(gpx|tcx)$/i.test(child.name)) out.push(child);
    } else if ("children" in child) {
      collectAllTrackFiles(child, out);
    }
  }
}

async function trackMatchFromFile(app: App, file: TFile): Promise<TrackMatch> {
  try {
    const xml = await app.vault.read(file);
    const stats = parseGpxStats(xml);
    return {
      path: file.path,
      name: file.name,
      distanceKm: stats.distanceKm,
      durationSec: stats.durationSec,
      startLabel: formatCoord(stats.start),
      endLabel: formatCoord(stats.end),
    };
  } catch {
    return {
      path: file.path,
      name: file.name,
      distanceKm: null,
      durationSec: null,
      startLabel: null,
      endLabel: null,
    };
  }
}

export async function findTracksForDay(
  app: App,
  date: Date,
  folder: string,
): Promise<TrackMatch[]> {
  const folderPath = folder.trim().replace(/^\/+|\/+$/g, "");
  if (!folderPath) return [];

  const root = app.vault.getAbstractFileByPath(folderPath);
  if (!root) return [];

  const dateKey = dateKeyForDate(date);
  const files: TFile[] = [];
  if (root instanceof TFile) {
    if (fileMatchesDate(root.name, dateKey)) files.push(root);
  } else {
    collectTrackFiles(root, dateKey, files);
  }

  const matches: TrackMatch[] = [];
  for (const file of files) {
    matches.push(await trackMatchFromFile(app, file));
  }

  return matches.sort((a, b) => a.name.localeCompare(b.name, "de"));
}

export async function findAllTracksInFolder(app: App, folder: string): Promise<TrackMatch[]> {
  const folderPath = folder.trim().replace(/^\/+|\/+$/g, "");
  if (!folderPath) return [];

  const root = app.vault.getAbstractFileByPath(folderPath);
  if (!root) return [];

  const files: TFile[] = [];
  if (root instanceof TFile) {
    if (/\.(gpx|tcx)$/i.test(root.name)) files.push(root);
  } else {
    collectAllTrackFiles(root, files);
  }

  const matches: TrackMatch[] = [];
  for (const file of files) {
    matches.push(await trackMatchFromFile(app, file));
  }

  return matches.sort((a, b) => a.name.localeCompare(b.name, "de"));
}
