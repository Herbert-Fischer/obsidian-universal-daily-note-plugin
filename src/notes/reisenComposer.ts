import type { App, TFile } from "obsidian";
import { ensureSectionHeading } from "./appendLogLine";
import { stripLeadingTimeFromKurz } from "./appendTagebuchFeedLine";
import type { ComposerEntry } from "./dailyComposer";
import { composerEntryText } from "./dailyComposer";
import {
  extractSectionRange,
  formatManagedCalloutTitleLine,
  isManagedCalloutStart,
} from "./journalCallout";
import { journalEntrySortMinutes, parseJournalEntryDisplay } from "./parseJournalEntryDisplay";
import { detailToCalloutProseLines, stripCalloutPrefixRaw } from "./calloutProse";
import { processVaultFile } from "./vaultProcess";
import { wandernCalloutTitle, type WandernSyncEntry } from "./wandernComposer";

export const REISEN_HEADING = "Reisen";
export const REISEN_META_PREFIX = "<!-- udn-reisen:";
export const REISEN_SORT_PREFIX = "<!-- udn-reisen-sort:";

export type ReisenMeta = {
  entryId: string;
  reise: string;
  detail: string;
};

export type ReisenSortOrder = "asc" | "desc";

export type ReisenSupplementsLoadResult = {
  supplements: Map<string, { reise: string; detail: string }>;
  sortOrders: Record<string, ReisenSortOrder>;
  entryIdsWithCallout: Set<string>;
};

export type ReisenSyncEntry = Pick<
  ComposerEntry,
  "entryId" | "time" | "body" | "context" | "profile" | "supplementDetail" | "supplementKurz" | "reiseAssignment"
>;

export function entryQualifiesForReisenSection(entry: Pick<ComposerEntry, "profile" | "reiseAssignment" | "entryId">): boolean {
  if (!entry.entryId?.trim()) return false;
  if (entry.profile === "reisen") return true;
  return entry.profile === "wandern" && Boolean(entry.reiseAssignment?.trim());
}

function reiseGroupKey(entry: ReisenSyncEntry): string {
  if (entry.profile === "wandern") return entry.reiseAssignment?.trim() ?? "";
  return entry.context?.trim() ?? "";
}

export function reisenSectionEntryTitle(entry: ReisenSyncEntry): string {
  if (entry.profile === "wandern") {
    return wandernCalloutTitle({
      entryId: entry.entryId,
      time: entry.time,
      body: entry.body,
      context: entry.context,
      profile: entry.profile,
    } as WandernSyncEntry);
  }
  return reisenCalloutTitle(entry);
}

function reisenSectionEntryDetail(entry: ReisenSyncEntry): string {
  if (entry.profile === "wandern") {
    return entry.supplementDetail?.trim() || entry.supplementKurz?.trim() || "";
  }
  return entry.supplementDetail ?? "";
}

function toReisenSyncEntry(entry: ComposerEntry): ReisenSyncEntry | null {
  if (!entryQualifiesForReisenSection(entry)) return null;
  if (entry.profile === "wandern") {
    return {
      entryId: entry.entryId,
      time: entry.time,
      body: entry.body,
      context: entry.context,
      profile: entry.profile,
      supplementDetail: entry.supplementDetail,
      supplementKurz: entry.supplementKurz,
      reiseAssignment: entry.reiseAssignment?.trim(),
    };
  }
  return {
    entryId: entry.entryId,
    time: entry.time,
    body: entry.body,
    context: entry.context,
    profile: entry.profile,
    supplementDetail: entry.supplementDetail,
  };
}

export function reisenMetaComment(meta: ReisenMeta): string {
  return `${REISEN_META_PREFIX} ${JSON.stringify(meta)} -->`;
}

export function reisenSortComment(reise: string, order: ReisenSortOrder): string {
  return `${REISEN_SORT_PREFIX} ${JSON.stringify({ reise, order })} -->`;
}

export function parseReisenMetaLine(line: string): ReisenMeta | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith(REISEN_META_PREFIX)) return null;
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Partial<ReisenMeta>;
    const entryId = parsed.entryId?.trim() ?? "";
    if (!entryId) return null;
    return {
      entryId,
      reise: parsed.reise?.trim() ?? "",
      detail: typeof parsed.detail === "string" ? parsed.detail : "",
    };
  } catch {
    return null;
  }
}

export function parseReisenSortLine(line: string): { reise: string; order: ReisenSortOrder } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith(REISEN_SORT_PREFIX)) return null;
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as {
      reise?: string;
      order?: string;
    };
    const reise = parsed.reise?.trim() ?? "";
    const order = parsed.order === "desc" ? "desc" : "asc";
    return { reise, order };
  } catch {
    return null;
  }
}

function stripCalloutPrefix(line: string): string {
  return stripCalloutPrefixRaw(line);
}

function proseAfterCalloutTitle(sectionLines: string[], titleLineIndex: number): string {
  const prose: string[] = [];
  for (let i = titleLineIndex + 1; i < sectionLines.length; i++) {
    const line = sectionLines[i] ?? "";
    const trimmed = line.trim();
    if (parseReisenMetaLine(trimmed) || parseReisenSortLine(trimmed)) break;
    if (isManagedCalloutStart(line, REISEN_HEADING)) break;
    if (!trimmed.startsWith(">")) break;
    const inner = stripCalloutPrefix(line);
    prose.push(inner);
  }
  return prose.join("\n");
}

export function buildReisenCalloutBlock(title: string, detail: string): string {
  const titel = title.trim() || "Reise";
  const lines = [formatManagedCalloutTitleLine(REISEN_HEADING, titel)];
  const proseLines = detailToCalloutProseLines(detail);
  if (proseLines.length === 0) {
    lines.push(">");
  } else {
    lines.push(...proseLines);
  }
  lines.push("");
  return lines.join("\n");
}

export function reisenCalloutTitle(entry: ReisenSyncEntry): string {
  const body = entry.body.trim();
  const parsed = parseJournalEntryDisplay(body);
  const text = stripLeadingTimeFromKurz(parsed.body.trim() || body);
  return text || "Reise";
}

function sortReisenEntries(entries: ReisenSyncEntry[], order: ReisenSortOrder): ReisenSyncEntry[] {
  const indexed = entries.map((entry, index) => ({
    entry,
    index,
    minutes: journalEntrySortMinutes(
      composerEntryText({
        time: entry.time,
        body: entry.body,
        entryId: entry.entryId,
        profile: entry.profile,
        context: entry.context,
      }),
    ),
  }));
  indexed.sort((a, b) => {
    const am = a.minutes ?? 9999;
    const bm = b.minutes ?? 9999;
    const cmp = am - bm || a.index - b.index;
    return order === "desc" ? -cmp : cmp;
  });
  return indexed.map((item) => item.entry);
}

export function renderReisenSectionBody(
  entries: ReisenSyncEntry[],
  sortModes: Record<string, ReisenSortOrder> = {},
): string[] {
  const reisenEntries = entries.filter((e) => e.entryId?.trim());
  if (reisenEntries.length === 0) return [];

  const byReise = new Map<string, ReisenSyncEntry[]>();
  for (const entry of reisenEntries) {
    const reise = reiseGroupKey(entry);
    const list = byReise.get(reise) ?? [];
    list.push(entry);
    byReise.set(reise, list);
  }

  const reiseKeys = [...byReise.keys()].sort((a, b) => {
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b, "de");
  });

  const out: string[] = [];
  for (const reise of reiseKeys) {
    const group = byReise.get(reise) ?? [];
    if (group.length === 0) continue;
    const order = sortModes[reise] ?? "asc";
    if (group.length > 1 || order !== "asc") {
      out.push(reisenSortComment(reise, order));
    }
    for (const entry of sortReisenEntries(group, order)) {
      const title = reisenSectionEntryTitle(entry);
      const detail = reisenSectionEntryDetail(entry);
      out.push(...buildReisenCalloutBlock(title, detail).split("\n"));
      out.push(
        reisenMetaComment({
          entryId: entry.entryId!,
          reise: reiseGroupKey(entry),
          detail,
        }),
      );
      out.push("");
    }
  }
  return out;
}

export function parseReisenSupplementsFromLines(lines: string[]): ReisenSupplementsLoadResult {
  const supplements = new Map<string, { reise: string; detail: string }>();
  const sortOrders: Record<string, ReisenSortOrder> = {};
  const entryIdsWithCallout = new Set<string>();

  const range = extractSectionRange(lines, REISEN_HEADING);
  const sectionLines = range ? lines.slice(range.start + 1, range.end) : [];

  for (const line of sectionLines) {
    const sort = parseReisenSortLine(line);
    if (sort) {
      sortOrders[sort.reise] = sort.order;
      continue;
    }
    const meta = parseReisenMetaLine(line);
    if (!meta) continue;
    entryIdsWithCallout.add(meta.entryId);
    let detail = meta.detail;
    if (!detail) {
      const idx = sectionLines.indexOf(line);
      for (let i = idx - 1; i >= 0; i--) {
        if (isManagedCalloutStart(sectionLines[i] ?? "", REISEN_HEADING)) {
          detail = proseAfterCalloutTitle(sectionLines, i);
          break;
        }
      }
    }
    supplements.set(meta.entryId, { reise: meta.reise, detail });
  }

  return { supplements, sortOrders, entryIdsWithCallout };
}

export async function loadReisenSupplements(app: App, file: TFile): Promise<ReisenSupplementsLoadResult> {
  let text = "";
  try {
    text = await app.vault.read(file);
  } catch {
    text = "";
  }
  return parseReisenSupplementsFromLines(text.split("\n"));
}

export function collectReisenEntryIds(lines: string[]): Set<string> {
  const ids = new Set<string>();
  for (const line of lines) {
    const meta = parseReisenMetaLine(line);
    if (meta?.entryId) ids.add(meta.entryId);
  }
  return ids;
}

export type ReisenSupplementTitleMatch = {
  entryId: string;
  reise: string;
};

/** Map ## Reisen callout titles to udn-reisen entry ids (fallback when Tagebuch bullets lost udn-entry). */
export function reisenSupplementMatchesByTitle(lines: string[]): Map<string, ReisenSupplementTitleMatch> {
  const map = new Map<string, ReisenSupplementTitleMatch>();
  const range = extractSectionRange(lines, REISEN_HEADING);
  if (!range) return map;

  const section = lines.slice(range.start + 1, range.end);
  for (let i = 0; i < section.length; i++) {
    const line = section[i] ?? "";
    if (!isManagedCalloutStart(line, REISEN_HEADING)) continue;
    const title = parseReisenCalloutBody(line).trim().toLowerCase();
    if (!title) continue;

    for (let j = i + 1; j < section.length; j++) {
      const next = section[j] ?? "";
      const meta = parseReisenMetaLine(next);
      if (meta?.entryId) {
        map.set(title, { entryId: meta.entryId, reise: meta.reise.trim() });
        break;
      }
      if (isManagedCalloutStart(next, REISEN_HEADING)) break;
    }
  }
  return map;
}

function parseReisenCalloutBody(line: string): string {
  const trimmed = line.trim();
  const m = trimmed.match(/^>\s*\[!([^\]|]+)(?:\|([^\]]*))?\]([+-])?\s*(.*)$/);
  if (!m) return "";
  return (m[2]?.trim() || (m[4]?.trim() ?? "").replace(/^[+-]\s*/, "").trim());
}

function replaceReisenSectionBody(lines: string[], bodyLines: string[]): string[] {
  const range = extractSectionRange(lines, REISEN_HEADING);
  if (!range) {
    if (bodyLines.length === 0) return lines;
    const next = [...lines];
    if (next.length > 0 && next[next.length - 1] !== "") next.push("");
    next.push(`## ${REISEN_HEADING}`, "");
    next.push(...bodyLines);
    return next;
  }
  if (bodyLines.length === 0) {
    return [...lines.slice(0, range.start), ...lines.slice(range.end)];
  }
  return [...lines.slice(0, range.start + 1), ...bodyLines, ...lines.slice(range.end)];
}

export async function syncReisenSupplements(
  app: App,
  file: TFile,
  entries: ComposerEntry[],
  sortModes: Record<string, ReisenSortOrder> = {},
): Promise<boolean> {
  const syncEntries: ReisenSyncEntry[] = entries
    .map((e) => toReisenSyncEntry(e))
    .filter((e): e is ReisenSyncEntry => e != null);

  const bodyLines = renderReisenSectionBody(syncEntries, sortModes);

  await processVaultFile(app, file, (raw) => {
    let lines = raw.split("\n");
    if (bodyLines.length > 0) {
      lines = ensureSectionHeading(lines, REISEN_HEADING);
    }
    lines = replaceReisenSectionBody(lines, bodyLines);
    const content = lines.join("\n");
    return content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
  });

  return true;
}

export function mergeReisenSupplementsIntoEntries(
  entries: ComposerEntry[],
  loaded: ReisenSupplementsLoadResult,
): ComposerEntry[] {
  return entries.map((entry) => {
    if (!entry.entryId) return entry;
    const sup = loaded.supplements.get(entry.entryId);
    if (!sup) return entry;

    if (entry.profile === "reisen") {
      const hasCallout = loaded.entryIdsWithCallout.has(entry.entryId);
      return {
        ...entry,
        supplementDetail: sup.detail,
        context: entry.context?.trim() || sup.reise || entry.context,
        calloutId: hasCallout ? entry.entryId : entry.calloutId,
      };
    }

    if (entry.profile === "wandern") {
      const hasCallout = loaded.entryIdsWithCallout.has(entry.entryId);
      return {
        ...entry,
        reiseAssignment: entry.reiseAssignment?.trim() || sup.reise || entry.reiseAssignment,
        calloutId: hasCallout ? entry.entryId : entry.calloutId,
      };
    }

    return entry;
  });
}
