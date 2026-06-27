import type { App, TFile } from "obsidian";
import type { WandernLayoutSettings } from "../settings";
import { ensureSectionHeading } from "./appendLogLine";
import { updateSummaryInContent } from "./dailyComposer";
import { extractSectionRange } from "./journalCallout";
import { formatGermanShortDate } from "./journalCallout";
import { formatTrackSummary, type TrackMatch } from "../tracks/gpxImport";
import { normalizeWandernPhotoPath, normalizeWandernTrackPath } from "./attachJournalMedia";

export type WandernMeta = {
  kurz: string;
  beschreibung: string;
  track: string;
  trackPath: string;
  fotos: string[];
  titel: string;
};

export type WandernComposerData = {
  titel: string;
  kurz: string;
  beschreibung: string;
  track: TrackMatch | null;
  photos: string[];
};

export const WANDERN_META_PREFIX = "<!-- udn-wandern:";
export const WANDERN_META_SUFFIX = "-->";

export const DEFAULT_WANDERN_LAYOUT_TEMPLATE = `> [!mountain]+ {{titel}}
>
> > [!multi-column]
> >
> > > [!blank|wide-60]
> > > **Kurz:** {{kurz}}
> > >
> > > {{beschreibung}}
> > >
> > > {{track3d}}
> >
> > > [!blank-container|no-margin gallery]
> > > {{fotos}}`;

export function replaceMultilinePlaceholder(template: string, key: string, value: string): string {
  const token = `{{${key}}}`;
  const lines = template.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const prefixMatch = line.match(/^((?:>\s*)*)/);
    const linePrefix = prefixMatch?.[1] ?? "";
    if (line === `${linePrefix}${token}`) {
      if (value) out.push(...value.split("\n"));
      continue;
    }
    out.push(line.replaceAll(token, value));
  }
  return out.join("\n");
}

export function indentMarkdownBlock(content: string, calloutPrefix: string): string {
  if (!calloutPrefix) return content;
  return content
    .split("\n")
    .map((line) => (line.length === 0 ? calloutPrefix.trimEnd() : `${calloutPrefix}${line}`))
    .join("\n");
}

export function childCalloutPrefix(prefix: string): string {
  return prefix ? `${prefix}> ` : "> ";
}

export function calloutPrefixBeforePlaceholder(template: string, placeholder: string): string {
  const token = `{{${placeholder}}}`;
  const idx = template.indexOf(token);
  if (idx < 0) return "";
  const lineStart = template.lastIndexOf("\n", idx) + 1;
  const line = template.slice(lineStart, idx);
  const match = line.match(/^((?:>\s*)+)/);
  return match?.[1] ?? "";
}

export function buildTrack3dBlock(
  path: string,
  height: number,
  calloutPrefix = "",
  exaggeration = 4,
): string {
  const safePath = path.trim();
  if (!safePath) return "";
  const raw = [
    "```udn-track-3d",
    `path: ${safePath}`,
    `height: ${Math.max(120, Math.round(height))}`,
    `exaggeration: ${Math.max(1, Math.round(exaggeration))}`,
    "```",
  ].join("\n");
  return indentMarkdownBlock(raw, calloutPrefix);
}

export function buildTrackLink(path: string): string {
  const safePath = path.trim();
  if (!safePath) return "";
  return `[[${safePath}|Track]]`;
}

export function wandernMetaComment(meta: WandernMeta): string {
  return `${WANDERN_META_PREFIX} ${JSON.stringify(meta)} ${WANDERN_META_SUFFIX}`;
}

export function parseWandernMetaLine(line: string): WandernMeta | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith(WANDERN_META_PREFIX)) return null;
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Partial<WandernMeta>;
    return {
      kurz: parsed.kurz?.trim() ?? "",
      beschreibung: parsed.beschreibung?.trim() ?? "",
      track: parsed.track?.trim() ?? "",
      trackPath: parsed.trackPath?.trim() ?? "",
      fotos: Array.isArray(parsed.fotos) ? parsed.fotos.map(String) : [],
      titel: parsed.titel?.trim() ?? "",
    };
  } catch {
    return null;
  }
}

export function parseWandernMetaFromLines(lines: string[]): WandernMeta | null {
  for (const line of lines) {
    const meta = parseWandernMetaLine(line);
    if (meta) return meta;
  }
  return null;
}

export type RenderWandernTemplateOptions = {
  titel: string;
  kurz: string;
  beschreibung: string;
  track: TrackMatch | null;
  photos: string[];
  date: Date;
  layout: WandernLayoutSettings;
};

export function buildPhotoCollageMarkdown(photoEmbeds: string[], calloutPrefix = ""): string {
  const embeds = photoEmbeds.map((p) => (p.trim().startsWith("![[") ? p.trim() : `![[${p.trim()}]]`)).filter(Boolean);
  if (embeds.length === 0) return "";
  if (embeds.length === 1) return `${calloutPrefix}${embeds[0]}`;
  return `${calloutPrefix}${embeds.join(" ")}`;
}

export function renderWandernTemplate(options: RenderWandernTemplateOptions): string {
  const template = options.layout.template.trim() || DEFAULT_WANDERN_LAYOUT_TEMPLATE;
  const maxPhotos = Math.max(1, options.layout.maxPhotos ?? 3);
  const photoEmbeds = options.photos.map((p) => (p.startsWith("![[") ? p : `![[${p}]]`));
  const fotoSlots: Record<string, string> = {};
  for (let i = 0; i < maxPhotos; i++) {
    fotoSlots[`foto${i + 1}`] = photoEmbeds[i] ?? "";
  }
  const trackPath = options.track?.path ?? "";
  const track3dPrefix = calloutPrefixBeforePlaceholder(template, "track3d");
  const fotosPrefix = calloutPrefixBeforePlaceholder(template, "fotos");
  const exaggeration = options.layout.track3dElevationExaggeration ?? 4;
  const track3d =
    options.layout.track3dEnabled && trackPath
      ? buildTrack3dBlock(trackPath, options.layout.track3dHeight, track3dPrefix, exaggeration)
      : "";
  const replacements: Record<string, string> = {
    titel: options.titel.trim() || "Wandern",
    kurz: options.kurz.trim(),
    beschreibung: options.beschreibung.trim(),
    track_summary: options.track ? formatTrackSummary(options.track) : "",
    track_link: trackPath ? buildTrackLink(trackPath) : "",
    track_gpx: trackPath,
    track3d,
    fotos: buildPhotoCollageMarkdown(photoEmbeds.filter(Boolean), fotosPrefix),
    datum: formatGermanShortDate(options.date),
    ...fotoSlots,
  };

  let out = template;
  const multilineKeys = new Set(["track3d", "fotos"]);
  for (const [key, value] of Object.entries(replacements)) {
    if (multilineKeys.has(key)) {
      out = replaceMultilinePlaceholder(out, key, value);
    } else {
      out = out.replaceAll(`{{${key}}}`, value);
    }
  }
  return out.replace(/\{\{foto\d+\}\}/g, "").trim();
}

export function wandernMetaFromData(data: WandernComposerData): WandernMeta {
  return {
    titel: data.titel.trim(),
    kurz: data.kurz.trim(),
    beschreibung: data.beschreibung.trim(),
    track: data.track ? formatTrackSummary(data.track) : "",
    trackPath: data.track?.path ?? "",
    fotos: data.photos.map((p) => (p.startsWith("![[") ? p : `![[${p}]]`)),
  };
}

export function replaceWandernSectionBody(
  lines: string[],
  rendered: string,
  meta: WandernMeta,
): string[] {
  const heading = "Wandern";
  const range = extractSectionRange(lines, heading);
  const bodyLines = [
    ...rendered.split("\n"),
    "",
    wandernMetaComment(meta),
    "",
  ];

  if (!range) {
    const next = [...lines];
    if (next.length > 0 && next[next.length - 1] !== "") next.push("");
    next.push(`## ${heading}`, "");
    next.push(...bodyLines);
    return next;
  }

  return [...lines.slice(0, range.start + 1), ...bodyLines, ...lines.slice(range.end)];
}

export function applyWandernBulkFields(
  data: WandernComposerData,
  options: {
    locationLabel?: string;
    track?: TrackMatch | null;
    photoPath?: string;
    maxPhotos: number;
  },
): WandernComposerData {
  let titel = data.titel.trim() || "Wandern";
  const locationLabel = options.locationLabel?.trim();
  if (locationLabel && !titel.toLowerCase().includes(locationLabel.toLowerCase())) {
    titel = titel.toLowerCase() === "wandern" ? `Wandern · ${locationLabel}` : `${titel} · ${locationLabel}`;
  }
  const photos = [...data.photos];
  if (options.photoPath && photos.length < options.maxPhotos) {
    photos.push(options.photoPath);
  }
  return {
    ...data,
    titel,
    track: options.track ?? data.track,
    photos,
  };
}

export async function loadWandernComposerData(
  app: App,
  file: TFile,
  fallbackTitel: string,
): Promise<WandernComposerData> {
  let text = "";
  try {
    text = await app.vault.read(file);
  } catch {
    text = "";
  }
  const lines = text.split("\n");
  const range = extractSectionRange(lines, "Wandern");
  const sectionLines = range ? lines.slice(range.start + 1, range.end) : [];
  const meta = parseWandernMetaFromLines(sectionLines);

  if (meta) {
    const track: TrackMatch | null = meta.trackPath
      ? {
          path: meta.trackPath,
          name: meta.trackPath.split("/").pop() ?? meta.trackPath,
          distanceKm: null,
          durationSec: null,
          startLabel: null,
          endLabel: null,
        }
      : null;
    return {
      titel: meta.titel || fallbackTitel,
      kurz: meta.kurz,
      beschreibung: meta.beschreibung,
      track,
      photos: meta.fotos.map((f) => f.replace(/^!\[\[|\]\]$/g, "")),
    };
  }

  return {
    titel: fallbackTitel,
    kurz: "",
    beschreibung: "",
    track: null,
    photos: [],
  };
}

export async function saveWandernComposerState(
  app: App,
  file: TFile,
  summary: string,
  date: Date,
  data: WandernComposerData,
  layout: WandernLayoutSettings,
): Promise<boolean> {
  const titel = data.titel.trim() || "Wandern";
  const photosFolder = layout.photosFolder?.trim() || "Calendar/Anhänge/Bilder";
  const tracksFolder = layout.tracksFolder?.trim() || "Calendar/Anhänge/GPX";
  const normalizedPhotos: string[] = [];
  for (let i = 0; i < data.photos.length; i++) {
    const raw = data.photos[i]!.replace(/^!\[\[|\]\]$/g, "");
    const path = await normalizeWandernPhotoPath(app, raw, i, titel, photosFolder);
    normalizedPhotos.push(path);
  }
  let track = data.track;
  if (track?.path) {
    const trackPath = await normalizeWandernTrackPath(app, track.path, titel, tracksFolder);
    track = {
      ...track,
      path: trackPath,
      name: trackPath.split("/").pop() ?? trackPath,
    };
  }
  const dataWithAssets = { ...data, photos: normalizedPhotos, track };
  const meta = wandernMetaFromData(dataWithAssets);
  const rendered = renderWandernTemplate({
    titel: dataWithAssets.titel,
    kurz: dataWithAssets.kurz,
    beschreibung: dataWithAssets.beschreibung,
    track: dataWithAssets.track,
    photos: dataWithAssets.photos,
    date,
    layout,
  });

  await app.vault.process(file, (raw) => {
    let content = updateSummaryInContent(raw, summary.trim());
    let lines = content.split("\n");
    lines = ensureSectionHeading(lines, "Wandern");
    lines = replaceWandernSectionBody(lines, rendered, meta);
    content = lines.join("\n");
    return content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
  });

  return true;
}

export function wandernTimelineTextFromMeta(meta: WandernMeta): string {
  if (meta.kurz.trim()) return `Kurzbeschreibung: ${meta.kurz.trim()}`;
  if (meta.beschreibung.trim()) return `Beschreibung: ${meta.beschreibung.trim()}`;
  if (meta.track.trim()) return `Track: ${meta.track.trim()}`;
  return meta.titel.trim() || "Wandern";
}
