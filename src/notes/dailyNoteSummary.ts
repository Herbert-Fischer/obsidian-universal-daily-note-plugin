import { TFile, type App } from "obsidian";

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
