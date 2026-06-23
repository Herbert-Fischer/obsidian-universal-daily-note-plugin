import { TFile, type App } from "obsidian";
import type { DailyNoteFallbackSettings } from "../settings";
import { ensureDailyNoteFileForDate } from "./appendLogLine";
import { extractJournalLines, type TimelineEntry } from "./dailyNoteTimeline";
import { ensureSectionHeading, findInsertIndex } from "./appendLogLine";
import { parseJournalEntryDisplay } from "./parseJournalEntryDisplay";
import { readDailyNoteSummary } from "./dailyNoteSummary";

export type ComposerEntry = {
  id: string;
  line: number;
  text: string;
  rawLine: string;
};

export type ComposerState = {
  file: TFile;
  dateKey: string;
  journalHeading: string;
  summary: string;
  entries: ComposerEntry[];
};

export type ComposerChip = {
  label: string;
  template: string;
  defaultTime?: string;
};

export const DEFAULT_COMPOSER_CHIPS: ComposerChip[] = [
  { label: "Aufstehen", template: "Aufstehen", defaultTime: "07:30" },
  { label: "Mittagessen", template: "Mittagessen:", defaultTime: "12:00" },
  { label: "Spaziergang", template: "Spaziergang:", defaultTime: "11:00" },
  { label: "Besuch", template: "Besuch:", defaultTime: "14:00" },
];

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function entryToComposer(entry: TimelineEntry, index: number): ComposerEntry {
  return {
    id: `line-${entry.line}`,
    line: entry.line,
    text: entry.text,
    rawLine: entry.rawLine,
  };
}


export function formatComposerEntryLine(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("- ") ? trimmed.slice(2).trim() : trimmed;
}

export function buildChipEntryText(chip: ComposerChip, time: string): string {
  const template = chip.template.trim();
  if (template === "Aufstehen") return `${time} Aufstehen`;
  if (template.endsWith(":")) return `${time} ${template} `;
  return `${time} ${template}`;
}

export function chipsFromPrefixes(prefixes: string[]): ComposerChip[] {
  const base = [...DEFAULT_COMPOSER_CHIPS];
  const seen = new Set(base.map((c) => c.template.toLowerCase()));
  for (const prefix of prefixes) {
    const p = prefix.trim();
    if (!p) continue;
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    base.push({ label: p.replace(/:$/, ""), template: p.endsWith(":") ? p : `${p}:`, defaultTime: "12:00" });
  }
  return base;
}

/** Build a short summary from journal entry texts. */
export function suggestSummaryFromEntries(entryTexts: string[]): string {
  const parts: string[] = [];
  for (const text of entryTexts) {
    const { body } = parseJournalEntryDisplay(text);
    const trimmed = body.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith("mittagessen:")) {
      const detail = trimmed.replace(/^mittagessen:\s*/i, "").trim();
      if (detail) parts.push(detail);
    } else if (lower.startsWith("spaziergang:")) {
      const detail = trimmed.replace(/^spaziergang:\s*/i, "").trim();
      parts.push(detail ? `Spaziergang ${detail}` : "Spaziergang");
    } else if (lower.startsWith("besuch")) {
      parts.push(trimmed);
    } else if (lower.startsWith("film:") || lower.startsWith("kaffee")) {
      parts.push(trimmed);
    }
    if (parts.length >= 4) break;
  }
  return parts.join("; ");
}

function formatSummaryYamlLine(summary: string): string {
  const trimmed = summary.trim();
  if (!trimmed) return "Zusammenfassung:";
  if (/[:#\[\]{}|>&*!@`]/.test(trimmed) || trimmed.includes('"')) {
    const escaped = trimmed.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `Zusammenfassung: "${escaped}"`;
  }
  return `Zusammenfassung: ${trimmed}`;
}

export function updateSummaryInContent(content: string, summary: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(content);
  if (!match) return content;
  let fm = match[1] ?? "";
  const body = match[2] ?? "";
  const line = formatSummaryYamlLine(summary);
  if (/^Zusammenfassung:/m.test(fm)) {
    fm = fm.replace(/^Zusammenfassung:.*$/m, line);
  } else {
    fm = `${fm.trimEnd()}\n${line}`;
  }
  return `---\n${fm}\n---\n${body}`;
}

function isJournalBulletLine(line: string): boolean {
  const trimmed = line.trim();
  return /^[-*+]\s/.test(trimmed) || /^>\s*[-*+]\s/.test(trimmed);
}

/** Replace bullet lines under ## heading; preserve callouts and other non-bullet lines. */
export function rewriteJournalBullets(
  lines: string[],
  journalHeading: string,
  entryTexts: string[],
): string[] {
  const target = journalHeading.trim().toLowerCase();
  const bullets = entryTexts.map((t) => `- ${formatComposerEntryLine(t)}`).filter((l) => l.length > 2);

  let sectionIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const h2 = lines[i]?.match(/^##\s+(.+)$/);
    if (h2 && h2[1]?.trim().toLowerCase() === target) {
      sectionIdx = i;
      break;
    }
  }

  if (sectionIdx < 0) {
    const next = [...lines];
    if (next.length > 0 && next[next.length - 1] !== "") next.push("");
    next.push(`## ${journalHeading.trim()}`, ...bullets, "");
    return next;
  }

  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (i === sectionIdx) {
      out.push(lines[i]!);
      i++;
      while (i < lines.length) {
        const line = lines[i] ?? "";
        if (/^#{1,6}\s/.test(line.trim())) break;
        if (isJournalBulletLine(line)) {
          i++;
          continue;
        }
        if (bullets.length === 0 && line.trim() === "") {
          i++;
          continue;
        }
        break;
      }
      out.push(...bullets);
      continue;
    }
    out.push(lines[i]!);
    i++;
  }
  return out;
}

export async function loadComposerState(
  app: App,
  date: Date,
  fallback: DailyNoteFallbackSettings,
  journalHeading: string,
): Promise<ComposerState> {
  const file = await ensureDailyNoteFileForDate(app, date, fallback);
  const heading = journalHeading.trim() || "Tagebuch";
  let text = "";
  try {
    text = await app.vault.read(file);
  } catch {
    text = "";
  }

  const entries = extractJournalLines(text.split("\n"), heading).map(entryToComposer);
  const summary = readDailyNoteSummary(app, file) || suggestSummaryFromEntries(entries.map((e) => e.text));

  return {
    file,
    dateKey: localDayKey(date),
    journalHeading: heading,
    summary,
    entries,
  };
}

export async function saveComposerState(
  app: App,
  state: Pick<ComposerState, "file" | "journalHeading" | "summary">,
  entryTexts: string[],
): Promise<boolean> {
  const texts = entryTexts.map(formatComposerEntryLine).filter(Boolean);
  const heading = state.journalHeading.trim() || "Tagebuch";

  await app.vault.process(state.file, (data) => {
    let content = updateSummaryInContent(data, state.summary.trim());
    let lines = content.split("\n");
    lines = ensureSectionHeading(lines, heading);
    const hasSection = lines.some((l) => {
      const m = l.match(/^##\s+(.+)$/);
      return m && m[1]?.trim().toLowerCase() === heading.toLowerCase();
    });
    if (!hasSection) {
      const idx = findInsertIndex(lines, null);
      lines = [...lines.slice(0, idx), `## ${heading}`, "", ...lines.slice(idx)];
    }
    lines = rewriteJournalBullets(lines, heading, texts);
    content = lines.join("\n");
    return content.endsWith("\n") || content.length === 0 ? content : `${content}\n`;
  });

  return true;
}
