import { wikiEmbedForPath } from "./attachJournalMedia";

/** Single normalized horizontal gallery row (replaces aspect-based collage-* layouts). */
export const PHOTO_GALLERY_ROW = "gallery-row";

export type PhotoGalleryLayout = typeof PHOTO_GALLERY_ROW | "";

export type PhotoCollageMeta = {
  fotos: string[];
  layout: PhotoGalleryLayout;
};

/** @deprecated Legacy layouts still parsed from old notes. */
export type PhotoCollageLayout = PhotoGalleryLayout | `collage-${string}`;

export const PHOTO_COLLAGE_META_PREFIX = "<!-- udn-photos:";
export const GALLERY_CALLOUT_BASE = "blank-container|no-margin gallery";

const IMAGE_EMBED_RE = /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;

export function stripPhotoEmbed(path: string): string {
  return path.replace(/^!\[\[|\]\]$/g, "").trim();
}

export function photoEmbed(path: string): string {
  const trimmed = stripPhotoEmbed(path);
  return trimmed ? wikiEmbedForPath(trimmed) : "";
}

export function photoEmbeds(paths: string[]): string[] {
  return paths.map(photoEmbed).filter(Boolean);
}

export function galleryLayoutForPhotoCount(count: number): PhotoGalleryLayout {
  return count > 0 ? PHOTO_GALLERY_ROW : "";
}

export function galleryCalloutTitle(layoutClass: PhotoGalleryLayout = PHOTO_GALLERY_ROW): string {
  if (!layoutClass) return GALLERY_CALLOUT_BASE;
  return `${GALLERY_CALLOUT_BASE} ${layoutClass}`;
}

export function buildPhotoCollageEmbeds(photos: string[]): string[] {
  return photoEmbeds(photos);
}

export function buildPhotoCollageBlock(
  photos: string[],
  layoutClass: PhotoGalleryLayout = PHOTO_GALLERY_ROW,
  calloutPrefix = "",
): string {
  const embeds = buildPhotoCollageEmbeds(photos);
  if (embeds.length === 0 || !layoutClass) return "";

  const title = galleryCalloutTitle(layoutClass);
  const calloutLine = `${calloutPrefix}[!${title}]`;
  const embedLine =
    embeds.length === 1
      ? `${calloutPrefix}${embeds[0]}`
      : `${calloutPrefix}${embeds.join(" ")}`;

  return [calloutLine, embedLine].join("\n");
}

export function buildPhotoCollageMarkdown(
  photos: string[],
  calloutPrefix = "",
  layoutClass: PhotoGalleryLayout = PHOTO_GALLERY_ROW,
): string {
  const layout = photos.length > 0 ? layoutClass || PHOTO_GALLERY_ROW : "";
  return buildPhotoCollageBlock(photos, layout, calloutPrefix);
}

export function buildPhotoCollageMarkdownAsync(
  _app: unknown,
  photos: string[],
  calloutPrefix = "",
): Promise<{ markdown: string; layout: PhotoGalleryLayout }> {
  const layout = galleryLayoutForPhotoCount(photos.length);
  return Promise.resolve({
    markdown: buildPhotoCollageBlock(photos, layout, calloutPrefix),
    layout,
  });
}

function stripCalloutPrefix(line: string): string {
  return line.replace(/^(?:>\s*)+/, "").trim();
}

function embedPathsFromLine(line: string): string[] {
  const paths: string[] = [];
  for (const match of line.matchAll(IMAGE_EMBED_RE)) {
    const path = match[1]?.trim();
    if (path) paths.push(path);
  }
  return paths;
}

export type ParsedPhotoCollage = {
  photos: string[];
  layout: PhotoGalleryLayout;
};

/** Parse gallery callout and legacy stacked embed lines inside a section range. */
export function parsePhotoCollageFromLines(lines: string[], start: number, end: number): ParsedPhotoCollage {
  const photos: string[] = [];
  let layout: PhotoGalleryLayout = "";

  for (let i = start; i < end; i++) {
    const stripped = stripCalloutPrefix(lines[i] ?? "");
    if (!stripped) continue;

    const galleryMatch = stripped.match(/^\[!blank-container[^\]]*gallery(?:\s+(gallery-row|collage-[a-z0-9-]+))?\]/i);
    if (galleryMatch) {
      layout = PHOTO_GALLERY_ROW;
      const embedLine = stripCalloutPrefix(lines[i + 1] ?? "");
      if (embedLine && !embedLine.startsWith("[!")) {
        photos.push(...embedPathsFromLine(embedLine));
        i++;
      }
      continue;
    }

    if (/^!\[\[/.test(stripped) && !stripped.startsWith("[!")) {
      photos.push(...embedPathsFromLine(stripped));
    }
  }

  if (photos.length > 0 && !layout) layout = PHOTO_GALLERY_ROW;
  return { photos, layout };
}

export function photoCollageMetaComment(meta: PhotoCollageMeta): string {
  return `${PHOTO_COLLAGE_META_PREFIX} ${JSON.stringify(meta)} -->`;
}

export function parsePhotoCollageMetaLine(line: string): PhotoCollageMeta | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith(PHOTO_COLLAGE_META_PREFIX)) return null;
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Partial<PhotoCollageMeta>;
    const fotos = Array.isArray(parsed.fotos) ? parsed.fotos.map((f) => stripPhotoEmbed(String(f))) : [];
    return {
      fotos,
      layout: fotos.length > 0 ? PHOTO_GALLERY_ROW : "",
    };
  } catch {
    return null;
  }
}

export function parsePhotoCollageMetaFromLines(lines: string[]): PhotoCollageMeta | null {
  for (const line of lines) {
    const meta = parsePhotoCollageMetaLine(line);
    if (meta) return meta;
  }
  return null;
}

export function mergePhotoSources(
  ...sources: Array<{ photos: string[]; layout?: PhotoGalleryLayout } | null | undefined>
): ParsedPhotoCollage {
  for (const source of sources) {
    if (source && source.photos.length > 0) {
      return {
        photos: source.photos.map(stripPhotoEmbed),
        layout: PHOTO_GALLERY_ROW,
      };
    }
  }
  return { photos: [], layout: "" };
}

export function nestedGalleryPrefixForCallout(calloutPrefix: string): string {
  return calloutPrefix ? `${calloutPrefix}> ` : "> ";
}

/** @deprecated Use galleryLayoutForPhotoCount. Kept for tests migrating from collage layouts. */
export function selectCollageLayoutClass(items: { path: string }[]): PhotoGalleryLayout {
  return galleryLayoutForPhotoCount(items.length);
}
