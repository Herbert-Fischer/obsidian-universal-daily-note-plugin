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

export const GEDANKEN_HEADING = "Gedanken";
export const GEDANKEN_ENTRY_META_PREFIX = "<!-- udn-gedanken-entry:";

export type GedankenMeta = {
  entryId: string;
  thema: string;
  detail: string;
};

export type GedankenSupplement = {
  thema: string;
  detail: string;
};

export type GedankenSupplementsLoadResult = {
  supplements: Map<string, GedankenSupplement>;
  entryIdsWithCallout: Set<string>;
};

export type GedankenSyncEntry = Pick<
  ComposerEntry,
  "entryId" | "time" | "body" | "context" | "profile" | "supplementDetail"
>;

export function gedankenMetaComment(meta: GedankenMeta): string {
  return `${GEDANKEN_ENTRY_META_PREFIX} ${JSON.stringify(meta)} -->`;
}

export function parseGedankenMetaLine(line: string): GedankenMeta | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith(GEDANKEN_ENTRY_META_PREFIX)) return null;
  const jsonStart = trimmed.indexOf("{");
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Partial<GedankenMeta>;
    const entryId = parsed.entryId?.trim() ?? "";
    if (!entryId) return null;
    return {
      entryId,
      thema: parsed.thema?.trim() ?? "",
      detail: typeof parsed.detail === "string" ? parsed.detail : "",
    };
  } catch {
    return null;
  }
}

function parseGedankenCalloutContent(sectionLines: string[], titleLineIndex: number): { detail: string } {
  let end = sectionLines.length;
  for (let i = titleLineIndex + 1; i < sectionLines.length; i++) {
    const line = sectionLines[i] ?? "";
    const trimmed = line.trim();
    if (parseGedankenMetaLine(trimmed) || isManagedCalloutStart(line, GEDANKEN_HEADING)) {
      end = i;
      break;
    }
  }

  const blockLines = sectionLines.slice(titleLineIndex + 1, end);
  const prose: string[] = [];
  for (const line of blockLines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(">")) continue;
    const inner = stripCalloutPrefixRaw(line);
    if (/^!\[\[/.test(inner) && !inner.trim().startsWith("[!")) continue;
    prose.push(inner);
  }
  return { detail: prose.join("\n") };
}

export function buildGedankenCalloutBlock(title: string, detail: string): string {
  const titel = title.trim() || "Gedanke";
  const lines = [formatManagedCalloutTitleLine(GEDANKEN_HEADING, titel)];
  const proseLines = detailToCalloutProseLines(detail);
  if (proseLines.length > 0) {
    lines.push(...proseLines);
  } else {
    lines.push(">");
  }
  lines.push("");
  return lines.join("\n");
}

export function gedankenCalloutTitle(entry: GedankenSyncEntry): string {
  const body = entry.body.trim();
  const parsed = parseJournalEntryDisplay(body);
  const text = stripLeadingTimeFromKurz(parsed.body.trim() || body);
  return text || "Gedanke";
}

function sortGedankenEntries(entries: GedankenSyncEntry[]): GedankenSyncEntry[] {
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
    return am - bm || a.index - b.index;
  });
  return indexed.map((item) => item.entry);
}

export function renderGedankenSectionBody(entries: GedankenSyncEntry[]): string[] {
  const gedankenEntries = entries.filter(
    (e) => e.profile === "gedanken" && e.entryId?.trim() && e.supplementDetail?.trim(),
  );
  if (gedankenEntries.length === 0) return [];

  const out: string[] = [];
  for (const entry of sortGedankenEntries(gedankenEntries)) {
    const title = gedankenCalloutTitle(entry);
    const detail = entry.supplementDetail ?? "";
    out.push(...buildGedankenCalloutBlock(title, detail).split("\n"));
    out.push(
      gedankenMetaComment({
        entryId: entry.entryId!,
        thema: entry.context?.trim() ?? "",
        detail,
      }),
    );
    out.push("");
  }
  return out;
}

export function parseGedankenSupplementsFromLines(lines: string[]): GedankenSupplementsLoadResult {
  const supplements = new Map<string, GedankenSupplement>();
  const entryIdsWithCallout = new Set<string>();

  const range = extractSectionRange(lines, GEDANKEN_HEADING);
  const sectionLines = range ? lines.slice(range.start + 1, range.end) : [];

  for (let i = 0; i < sectionLines.length; i++) {
    const line = sectionLines[i] ?? "";
    const meta = parseGedankenMetaLine(line);
    if (!meta) continue;
    entryIdsWithCallout.add(meta.entryId);

    let detail = meta.detail;
    for (let j = i - 1; j >= 0; j--) {
      if (isManagedCalloutStart(sectionLines[j] ?? "", GEDANKEN_HEADING)) {
        const parsed = parseGedankenCalloutContent(sectionLines, j);
        if (!detail) detail = parsed.detail;
        break;
      }
    }

    supplements.set(meta.entryId, { thema: meta.thema, detail });
  }

  return { supplements, entryIdsWithCallout };
}

export async function loadGedankenSupplements(app: App, file: TFile): Promise<GedankenSupplementsLoadResult> {
  let text = "";
  try {
    text = await app.vault.read(file);
  } catch {
    text = "";
  }
  return parseGedankenSupplementsFromLines(text.split("\n"));
}

function replaceGedankenSectionBody(lines: string[], bodyLines: string[]): string[] {
  const range = extractSectionRange(lines, GEDANKEN_HEADING);
  if (!range) {
    if (bodyLines.length === 0) return lines;
    const next = [...lines];
    if (next.length > 0 && next[next.length - 1] !== "") next.push("");
    next.push(`## ${GEDANKEN_HEADING}`, "");
    next.push(...bodyLines);
    return next;
  }
  if (bodyLines.length === 0) {
    return [...lines.slice(0, range.start), ...lines.slice(range.end)];
  }
  return [...lines.slice(0, range.start + 1), ...bodyLines, ...lines.slice(range.end)];
}

export async function syncGedankenSupplements(
  app: App,
  file: TFile,
  entries: ComposerEntry[],
): Promise<boolean> {
  const syncEntries: GedankenSyncEntry[] = entries
    .filter((entry) => entry.profile === "gedanken" && entry.entryId?.trim())
    .map((e) => ({
      entryId: e.entryId,
      time: e.time,
      body: e.body,
      context: e.context,
      profile: e.profile,
      supplementDetail: e.supplementDetail,
    }));

  const bodyLines = renderGedankenSectionBody(syncEntries);

  await processVaultFile(app, file, (raw) => {
    let lines = raw.split("\n");
    if (bodyLines.length > 0) {
      lines = ensureSectionHeading(lines, GEDANKEN_HEADING);
    }
    lines = replaceGedankenSectionBody(lines, bodyLines);
    const content = lines.join("\n");
    return content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
  });

  return true;
}

export function mergeGedankenSupplementsIntoEntries(
  entries: ComposerEntry[],
  loaded: GedankenSupplementsLoadResult,
): ComposerEntry[] {
  return entries.map((entry) => {
    if (entry.profile !== "gedanken" || !entry.entryId) return entry;
    const sup = loaded.supplements.get(entry.entryId);
    if (!sup) return entry;
    const hasCallout = loaded.entryIdsWithCallout.has(entry.entryId);
    return {
      ...entry,
      supplementDetail: sup.detail,
      context: entry.context?.trim() || sup.thema || entry.context,
      calloutId: hasCallout ? entry.entryId : entry.calloutId,
    };
  });
}
