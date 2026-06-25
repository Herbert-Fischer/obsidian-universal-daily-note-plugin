import type { App, TFile } from "obsidian";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatTemplateDate(date: Date, fmt: string): string {
  const yyyy = String(date.getFullYear());
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  return fmt.replaceAll("YYYY", yyyy).replaceAll("MM", mm).replaceAll("DD", dd);
}

/** Resolve `{date}` / `{{date}}` and optional `:FORMAT` (YYYY, MM, DD tokens). */
export function applyDailyNoteTemplate(template: string, date: Date): string {
  const iso = formatTemplateDate(date, "YYYY-MM-DD");
  return template
    .replace(/\{\{date:([^}]+)\}\}/g, (_, fmt: string) => formatTemplateDate(date, fmt.trim()))
    .replace(/\{date:([^}]+)\}/g, (_, fmt: string) => formatTemplateDate(date, fmt.trim()))
    .replace(/\{\{date\}\}/g, iso)
    .replace(/\{date\}/g, iso);
}

export async function readDailyNoteTemplate(
  app: App,
  path: string | null,
  date: Date,
): Promise<string | null> {
  if (!path) return null;
  const f = app.vault.getAbstractFileByPath(path);
  if (!(f instanceof TFile)) return null;
  try {
    const raw = await app.vault.read(f);
    return applyDailyNoteTemplate(raw, date);
  } catch {
    return null;
  }
}
