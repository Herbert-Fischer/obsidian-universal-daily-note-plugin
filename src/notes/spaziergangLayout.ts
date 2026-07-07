import type { App, TFile } from "obsidian";
import type { WandernLayoutSettings } from "../settings";
import { DEFAULT_JOURNAL_HEADING } from "../settings";
import { ensureSectionHeading } from "./appendLogLine";
import { upsertTagebuchFeedLine } from "./appendTagebuchFeedLine";
import { updateSummaryInContent } from "./dailyComposer";
import { buildWandernFeedKurz } from "./feedDetailComposer";
import { extractSectionRange } from "./journalCallout";
import { formatGermanShortDate } from "./journalCallout";
import { journalProfileById } from "./journalProfiles";
import { formatTrackSummary, type TrackMatch } from "../tracks/gpxImport";
import { normalizeDailyNotePhotoPath, normalizeWandernTrackPath } from "./attachJournalMedia";
import { processVaultFile } from "./vaultProcess";
import {
  buildPhotoCollageMarkdown,
  buildPhotoCollageMarkdownAsync,
  type PhotoCollageLayout,
  stripPhotoEmbed,
} from "./photoCollage";

export type SpaziergangMeta = {
  kurz: string;
  beschreibung: string;
  track: string;
  trackPath: string;
  fotos: string[];
  titel: string;
  layout?: PhotoCollageLayout | "";
};

export type SpaziergangComposerData = {
  titel: string;
  kurz: string;
  beschreibung: string;
  track: TrackMatch | null;
  photos: string[];
};

export const SPAZIERGANG_META_PREFIX = "<!-- udn-spaziergang:";
export const SPAZIERGANG_META_SUFFIX = "-->";

export const DEFAULT_SPAZIERGANG_LAYOUT_TEMPLATE = `> [!person-walking]+ {{titel}}
>
> > [!multi-column]
> >
> > > [!blank|wide-60]
> > > {{beschreibung}}
> > >
> > > {{track3d}}
> >
> > > {{fotos}}`;

export function replaceMultilinePlaceholder(template: string, key: string, value: string): string {
  const token = `{{${key}}}`;
  const lines = template.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const prefixMatch = line.match(/^((?:>\s*)*)/);
    const linePrefix = prefixMatch?.[1] ?? "";
    if (line === `${linePrefix}${token}`) {
      if (value) {
        out.push(
          ...value.split("\n").map((part) => (part.length === 0 ? linePrefix.trimEnd() : `${linePrefix}${part}`)),
        );
      }
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

export function spaziergangMetaComment(meta: SpaziergangMeta): string {
  return `${SPAZIERGANG_META_PREFIX} ${JSON.stringify(meta)} ${SPAZIERGANG_META_SUFFIX}`;
}

export function parseSpaziergangMetaLine(line: string): SpaziergangMeta | null {
  const trimmed = line.trim().replace(/^(?:>\s*)+/, "");
  if (!trimmed.startsWith(SPAZIERGANG_META_PREFIX)) return null;
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Partial<SpaziergangMeta>;
    return {
      kurz: parsed.kurz?.trim() ?? "",
      beschreibung: parsed.beschreibung?.trim() ?? "",
      track: parsed.track?.trim() ?? "",
      trackPath: parsed.trackPath?.trim() ?? "",
      fotos: Array.isArray(parsed.fotos) ? parsed.fotos.map(String) : [],
      titel: parsed.titel?.trim() ?? "",
      layout: (parsed.layout as PhotoCollageLayout | "") ?? "",
    };
  } catch {
    return null;
  }
}

export function parseSpaziergangMetaFromLines(lines: string[]): SpaziergangMeta | null {
  for (const line of lines) {
    const meta = parseSpaziergangMetaLine(line);
    if (meta) return meta;
  }
  return null;
}

function stripCalloutPrefix(line: string): string {
  return line.replace(/^(?:>\s*)+/, "").trim();
}

/** Fallback when `<!-- udn-spaziergang:` metadata is missing (manual or legacy notes). */
export function parseSpaziergangFromSectionLines(
  lines: string[],
  fallbackTitel: string,
): SpaziergangComposerData | null {
  let titel = fallbackTitel.trim() || "Spaziergang";
  let kurz = "";
  let beschreibung = "";
  const photos: string[] = [];
  let trackPath = "";

  for (const rawLine of lines) {
    const line = stripCalloutPrefix(rawLine);
    if (!line) continue;

    const head = line.match(/^\[![^\]]+\]\+?\s*(.+)$/i);
    if (head?.[1]?.trim()) {
      titel = head[1].trim();
      continue;
    }

    const kurzMatch = line.match(/^\*\*Kurz:\*\*\s*(.+)$/i);
    if (kurzMatch?.[1]) {
      kurz = kurzMatch[1].trim();
      continue;
    }

    const embeds = [...line.matchAll(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map((m) => m[1]!.trim());
    for (const embed of embeds) {
      if (/\.(gpx|tcx)$/i.test(embed)) {
        trackPath = embed;
      } else if (/\.(jpe?g|png|webp|gif|heic)$/i.test(embed)) {
        photos.push(embed);
      }
    }

    const trackPathMatch = line.match(/^path:\s*(.+)$/i);
    if (trackPathMatch?.[1]) {
      trackPath = trackPathMatch[1].trim();
    }
  }

  const descLines: string[] = [];
  let inDescription = false;
  for (const rawLine of lines) {
    const line = stripCalloutPrefix(rawLine);
    if (/^\*\*Kurz:\*\*/i.test(line)) {
      inDescription = true;
      continue;
    }
    if (!inDescription) continue;
    if (
      !line ||
      /^\[!/.test(line) ||
      /^\*\*Kurz:\*\*/i.test(line) ||
      line.startsWith("```") ||
      /^path:/i.test(line) ||
      /!\[\[/.test(line)
    ) {
      if (descLines.length > 0) break;
      continue;
    }
    descLines.push(line);
  }
  beschreibung = descLines.join("\n").trim();

  if (
    !kurz &&
    !beschreibung &&
    photos.length === 0 &&
    !trackPath &&
    titel === (fallbackTitel.trim() || "Spaziergang")
  ) {
    return null;
  }

  const track: TrackMatch | null = trackPath
    ? {
        path: trackPath,
        name: trackPath.split("/").pop() ?? trackPath,
        distanceKm: null,
        durationSec: null,
        startLabel: null,
        endLabel: null,
      }
    : null;

  return {
    titel,
    kurz,
    beschreibung,
    track,
    photos,
  };
}

export type RenderSpaziergangTemplateOptions = {
  titel: string;
  kurz: string;
  beschreibung: string;
  track: TrackMatch | null;
  photos: string[];
  date: Date;
  layout: WandernLayoutSettings;
  photoCollageMarkdown?: string;
  layoutClass?: PhotoCollageLayout | "";
};

export { buildPhotoCollageMarkdown } from "./photoCollage";

export function renderSpaziergangTemplate(options: RenderSpaziergangTemplateOptions): string {
  const {
    titel,
    kurz,
    beschreibung,
    track,
    photos,
    date,
    layout,
    photoCollageMarkdown,
    layoutClass,
  } = options;

  const tpl = layout.template?.trim() ? layout.template : DEFAULT_SPAZIERGANG_LAYOUT_TEMPLATE;
  const short = kurz.trim() ? `**Kurz:** ${kurz.trim()}` : "";
  const desc = beschreibung.trim();

  const trackLink = track?.path?.trim() ? buildTrackLink(track.path) : "";
  const trackText = track ? formatTrackSummary(track) : "";
  const trackLine = trackText || trackLink ? `**Track:** ${trackText || trackLink}` : "";

  const track3d = layout.track3dEnabled && track?.path
    ? buildTrack3dBlock(
        track.path,
        layout.track3dHeight,
        "",
        layout.track3dElevationExaggeration,
      )
    : "";

  const photosTrimmed = photos.map(stripPhotoEmbed).filter(Boolean).slice(0, Math.max(0, layout.maxPhotos ?? 0));
  const photoBlock =
    photoCollageMarkdown ??
    (photosTrimmed.length > 0 ? buildPhotoCollageMarkdown(photosTrimmed, "", layoutClass) : "");

  let out = tpl;
  out = replaceMultilinePlaceholder(out, "titel", titel.trim() || "Spaziergang");
  out = replaceMultilinePlaceholder(out, "kurz", short);
  out = replaceMultilinePlaceholder(out, "beschreibung", desc);
  out = replaceMultilinePlaceholder(out, "track", trackLine);
  out = replaceMultilinePlaceholder(out, "track3d", track3d);
  out = replaceMultilinePlaceholder(out, "fotos", photoBlock);

  // Legacy single-photo placeholders (compatible with some templates)
  const photo1 = photosTrimmed[0] ? `![[${photosTrimmed[0]}]]` : "";
  out = out.replaceAll("{{foto1}}", photo1);

  // Add a compact day line when template does not include it.
  const day = formatGermanShortDate(date);
  if (!out.includes(day) && !out.includes("{{datum}}")) {
    // no-op: templates are user controlled; keep silent
  }
  out = out.replaceAll("{{datum}}", day);

  return out
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

export function spaziergangMetaFromData(
  data: SpaziergangComposerData,
  trackPath: string,
  trackSummary: string,
  photos: string[],
  layout?: PhotoCollageLayout | "",
): SpaziergangMeta {
  return {
    titel: data.titel.trim(),
    kurz: data.kurz.trim(),
    beschreibung: data.beschreibung,
    track: trackSummary.trim(),
    trackPath: trackPath.trim(),
    fotos: photos.map(stripPhotoEmbed).filter(Boolean),
    layout: layout ?? "",
  };
}

export async function updateSpaziergangMetaInFile(
  app: App,
  file: TFile,
  date: Date,
  layout: WandernLayoutSettings,
): Promise<boolean> {
  const profile = journalProfileById("spaziergang");
  const photosFolder = layout.photosFolder?.trim() || profile?.photosFolder.trim() || "Calendar/Anhänge/Bilder";
  const tracksFolder = layout.tracksFolder?.trim() || "Calendar/Anhänge/GPX";

  const updated = await processVaultFile(app, file.path, async (content) => {
    const lines = content.split("\n");
    const range = extractSectionRange(lines, "Spaziergang");
    if (!range) return content;

    const sectionLines = lines.slice(range.start + 1, range.end);
    const meta = parseSpaziergangMetaFromLines(sectionLines);
    if (!meta) return content;

    const data: SpaziergangComposerData = {
      titel: meta.titel.trim() || "Spaziergang",
      kurz: meta.kurz.trim(),
      beschreibung: meta.beschreibung,
      track: meta.trackPath ? { path: meta.trackPath, name: "", distanceKm: null, durationSec: null, startLabel: null, endLabel: null } : null,
      photos: meta.fotos.map(stripPhotoEmbed).filter(Boolean),
    };

    const trackPath = meta.trackPath?.trim()
      ? await normalizeWandernTrackPath(app, meta.trackPath, data.titel, tracksFolder)
      : "";

    const normalizedPhotos: string[] = [];
    for (let i = 0; i < data.photos.length; i++) {
      const p = data.photos[i]!;
      const next = await normalizeDailyNotePhotoPath(app, p, i, date, data.titel, photosFolder);
      normalizedPhotos.push(next);
    }

    const trackSummary = data.track ? formatTrackSummary({ ...data.track, path: trackPath || data.track.path }) : "";
    const nextMeta = spaziergangMetaFromData(data, trackPath, trackSummary, normalizedPhotos, meta.layout ?? "");

    const { markdown: photoCollageMarkdown } = await buildPhotoCollageMarkdownAsync(
      app,
      normalizedPhotos,
      "",
    );

    const nextSection = renderSpaziergangTemplate({
      titel: data.titel,
      kurz: data.kurz,
      beschreibung: data.beschreibung,
      track: data.track ? { ...data.track, path: trackPath || data.track.path } : null,
      photos: normalizedPhotos,
      date,
      layout,
      layoutClass: meta.layout ?? "",
      photoCollageMarkdown,
    });

    const replaced = [
      ...lines.slice(0, range.start + 1),
      ...nextSection.split("\n"),
      spaziergangMetaComment(nextMeta),
      ...lines.slice(range.end),
    ];

    let next = replaced.join("\n");
    next = updateSummaryInContent(next);
    return next.endsWith("\n") || next.length === 0 ? next : `${next}\n`;
  });

  if (!updated) return false;

  // Also ensure a feed line exists in ## Tagebuch when a day-level meta exists.
  await processVaultFile(app, file.path, async (content) => {
    let lines = content.split("\n");
    const range = extractSectionRange(lines, "Spaziergang");
    if (!range) return content;
    const sectionLines = lines.slice(range.start + 1, range.end);
    const meta = parseSpaziergangMetaFromLines(sectionLines);
    if (!meta) return content;

    const profile = journalProfileById("spaziergang");
    if (!profile) return content;

    const title = meta.titel.trim() || "Spaziergang";
    const text = spaziergangTimelineTextFromMeta(meta);
    const feed = buildWandernFeedKurz(text); // same formatting (Kurzbeschreibung:/Beschreibung:/Track:)

    lines = upsertTagebuchFeedLine(
      lines,
      {
        calloutTitle: formatGermanShortDate(date),
        feedLine: {
          text: feed,
          feedMeta: {
            profile: "spaziergang",
            context: title.trim() !== "Spaziergang" ? title.trim() : "",
          },
          suffixLinks: profile.feedSuffix,
        },
      },
      date,
    );
    lines = ensureSectionHeading(lines, DEFAULT_JOURNAL_HEADING);
    const next = lines.join("\n");
    return next.endsWith("\n") || next.length === 0 ? next : `${next}\n`;
  });

  return true;
}

export function spaziergangTimelineTextFromMeta(meta: SpaziergangMeta): string {
  if (meta.kurz.trim()) return `Kurzbeschreibung: ${meta.kurz.trim()}`;
  if (meta.beschreibung.trim()) return `Beschreibung: ${meta.beschreibung.trim()}`;
  if (meta.track.trim()) return `Track: ${meta.track.trim()}`;
  return meta.titel.trim() || "Spaziergang";
}

