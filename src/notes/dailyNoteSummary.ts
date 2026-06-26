import { TFile, type App } from "obsidian";

/** Read `Zusammenfassung` directly from file content (not metadata cache). */
export function readSummaryFromContent(content: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match) return "";
  const fm = match[1] ?? "";
  const line = fm.match(/^Zusammenfassung:\s*(.*)$/m)?.[1]?.trim() ?? "";
  if (!line) return "";
  if (line.startsWith('"') && line.endsWith('"')) {
    return line.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
  }
  return line;
}

/** Frontmatter `Zusammenfassung` (or lowercase variant) from metadata cache. */
export function readDailyNoteSummary(app: App, file: TFile): string {
  const fm = app.metadataCache.getFileCache(file)?.frontmatter;
  if (!fm) return "";
  const raw = fm.Zusammenfassung ?? fm.zusammenfassung;
  if (raw == null) return "";
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) return raw.map(String).join("; ").trim();
  return String(raw).trim();
}
