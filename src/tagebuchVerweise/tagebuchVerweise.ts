import type { App, CachedMetadata, TFile } from "obsidian";
import type { TagebuchVerweiseSettings } from "../settings";

import { isAllJournalHeadings } from "../notes/journalHeadingFilter";
import { journalHeadingForLine, isDailyNoteInDateRange } from "../notes/journalSection";

export type TagebuchVerweisEntry = {
  sortKey: number | string;
  dailyNotePath: string;
  dailyNoteLabel: string;
  line: string;
  sourceLine: number;
  section?: string;
};

export type FindTagebuchVerweiseOptions = {
  journalHeading?: string | null;
  startDateKey?: string | null;
  endDateKey?: string | null;
};

function fileBasename(file: TFile | { basename?: string; name?: string } | null): string {
  if (!file) return "";
  const name = file.basename ?? file.name ?? "";
  return String(name).replace(/\.md$/i, "");
}

export function linkTargetMatches(
  linkDest: string,
  targetFile: TFile,
): boolean {
  if (!linkDest || !targetFile) return false;
  const base = fileBasename(targetFile);
  if (!base) return false;
  const stem = base;
  const dest = String(linkDest).split("#")[0].split("|")[0].trim();
  if (!dest) return false;
  if (dest === base || dest === stem) return true;
  if (dest.endsWith("/" + base) || dest.endsWith("/" + stem)) return true;
  if (dest.replace(/\.md$/i, "") === stem) return true;
  return false;
}

function lineLooksLikeLink(line: string, targetFile: TFile): boolean {
  const base = fileBasename(targetFile).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!base) return false;
  return new RegExp(`\\[\\[[^\\]]*${base}[^\\]]*\\]\\]`, "i").test(line);
}

function collectLines(
  file: TFile,
  targetFile: TFile,
  textLines: string[],
  cache: CachedMetadata | null,
): { text: string; lineNum: number }[] {
  const hits: { text: string; lineNum: number }[] = [];
  const usedLines = new Set<number>();

  for (const l of cache?.links ?? []) {
    if (!linkTargetMatches(l.link, targetFile)) continue;
    const n = l.position?.start?.line;
    if (n == null || usedLines.has(n)) continue;
    const line = (textLines[n] ?? "").trim();
    if (!line || line === "---") continue;
    usedLines.add(n);
    hits.push({ text: line, lineNum: n });
  }

  if (hits.length === 0) {
    for (let n = 0; n < textLines.length; n++) {
      const line = (textLines[n] ?? "").trim();
      if (!line || line.startsWith("---") || usedLines.has(n)) continue;
      if (lineLooksLikeLink(line, targetFile)) {
        usedLines.add(n);
        hits.push({ text: line, lineNum: n });
      }
    }
  }

  return hits;
}

function isDailyNoteFile(f: TFile, fileClass: string, cache: CachedMetadata | null): boolean {
  const fm = cache?.frontmatter;
  const cls = fm?.fileClass ?? fm?.fileclass;
  return cls === fileClass;
}

function isInDailyNotesFolder(path: string, folder: string): boolean {
  const f = folder.trim().replace(/\/+$/, "");
  if (!f) return false;
  return path === f || path.startsWith(`${f}/`);
}

function journalLineCell(raw: string): string {
  return String(raw)
    .trim()
    .replace(/^>\s*/, "")
    .replace(/^[-*+]\s+/, "");
}

function erstelltSortKey(file: TFile, cache: CachedMetadata | null): number | string {
  const raw = cache?.frontmatter?.Erstellt ?? cache?.frontmatter?.erstellt;
  if (typeof raw === "string" && raw.trim()) {
    const t = Date.parse(raw.trim());
    if (!Number.isNaN(t)) return t;
  }
  return file.basename;
}

function compareSortKeys(a: number | string, b: number | string): number {
  const na = typeof a === "number" ? a : 0;
  const nb = typeof b === "number" ? b : 0;
  if (na || nb) return nb - na;
  return String(b).localeCompare(String(a), "de");
}

async function appendRowsForDailyNote(
  app: App,
  sourceFile: TFile,
  targetFile: TFile,
  rows: TagebuchVerweisEntry[],
  options: FindTagebuchVerweiseOptions = {},
): Promise<void> {
  const cache = app.metadataCache.getFileCache(sourceFile);
  const sortKey = erstelltSortKey(sourceFile, cache ?? null);
  const label = sourceFile.basename.replace(/\.md$/i, "");

  if (options.startDateKey && options.endDateKey) {
    if (!isDailyNoteInDateRange(label, options.startDateKey, options.endDateKey)) return;
  }

  let text = "";
  try {
    text = await app.vault.read(sourceFile);
  } catch {
    rows.push({
      sortKey,
      dailyNotePath: sourceFile.path,
      dailyNoteLabel: label,
      line: "_Fehler beim Lesen_",
      sourceLine: 0,
    });
    return;
  }

  const textLines = text.split("\n");
  const headingFilter = options.journalHeading?.trim() || null;
  const filterAll = isAllJournalHeadings(headingFilter);
  const hits = collectLines(sourceFile, targetFile, textLines, cache ?? null).filter(({ lineNum }) => {
    if (filterAll || !headingFilter) return true;
    const section = journalHeadingForLine(textLines, lineNum);
    return section?.toLowerCase() === headingFilter.toLowerCase();
  });

  if (hits.length === 0) return;

  for (const { text: raw, lineNum } of hits) {
    rows.push({
      sortKey,
      dailyNotePath: sourceFile.path,
      dailyNoteLabel: label,
      line: journalLineCell(raw),
      sourceLine: lineNum,
      section: filterAll ? journalHeadingForLine(textLines, lineNum) ?? undefined : undefined,
    });
  }
}

export async function findTagebuchVerweise(
  app: App,
  targetFile: TFile,
  settings: TagebuchVerweiseSettings,
  options: FindTagebuchVerweiseOptions = {},
): Promise<TagebuchVerweisEntry[]> {
  const rows: TagebuchVerweisEntry[] = [];
  const seen = new Set<string>();
  const { dailyNotesFolder, dailyNotesFileClass } = settings;

  const blData = app.metadataCache.getBacklinksForFile(targetFile)?.data;
  const backlinkMap =
    blData && typeof blData.backlinks === "object" && blData.backlinks !== null
      ? blData.backlinks
      : (blData ?? {});

  const backlinkPaths = Object.keys(backlinkMap).filter((p) =>
    isInDailyNotesFolder(p, dailyNotesFolder),
  );

  for (const sourcePath of backlinkPaths) {
    if (seen.has(sourcePath)) continue;
    const f = app.vault.getAbstractFileByPath(sourcePath);
    if (!(f instanceof TFile)) continue;
    const cache = app.metadataCache.getFileCache(f);
    if (!isDailyNoteFile(f, dailyNotesFileClass, cache ?? null)) continue;
    seen.add(sourcePath);
    await appendRowsForDailyNote(app, f, targetFile, rows, options);
  }

  if (rows.length === 0) {
    for (const f of app.vault.getMarkdownFiles()) {
      if (!isInDailyNotesFolder(f.path, dailyNotesFolder)) continue;
      if (seen.has(f.path)) continue;
      const cache = app.metadataCache.getFileCache(f);
      if (!isDailyNoteFile(f, dailyNotesFileClass, cache ?? null)) continue;
      if (!cache?.links?.some((l) => linkTargetMatches(l.link, targetFile))) continue;
      seen.add(f.path);
      await appendRowsForDailyNote(app, f, targetFile, rows, options);
    }
  }

  rows.sort((a, b) => compareSortKeys(a.sortKey, b.sortKey));
  return rows;
}
