import type { App } from "obsidian";

const PLUGIN_ID = "universal-daily-note";
const LOG_NAME = "composer-save.log";
const MAX_BYTES = 48_000;

function logPath(app: App): string {
  return `${app.vault.configDir}/plugins/${PLUGIN_ID}/${LOG_NAME}`;
}

function formatLine(message: string, detail?: string): string {
  const ts = new Date().toISOString();
  const extra = detail ? ` ${detail}` : "";
  return `${ts} ${message}${extra}\n`;
}

async function trimLog(app: App): Promise<void> {
  const path = logPath(app);
  try {
    const raw = await app.vault.adapter.read(path);
    if (raw.length <= MAX_BYTES) return;
    const lines = raw.split("\n").filter(Boolean);
    const tail = lines.slice(-120).join("\n");
    await app.vault.adapter.write(path, tail.endsWith("\n") ? tail : `${tail}\n`);
  } catch {
    /* first write */
  }
}

/** Append-only composer save trace (readable after Obsidian freeze/restart). */
export async function traceComposerSave(app: App, message: string, detail?: string): Promise<void> {
  try {
    await trimLog(app);
    await app.vault.adapter.append(logPath(app), formatLine(message, detail));
  } catch {
    /* never block save */
  }
}

export function composerSaveLogPath(app: App): string {
  return logPath(app);
}

let lastComposerSave: { at: number; dateKey: string } | null = null;

/** Mark a composer save so outline calendar sync can skip the just-written day. */
export function markComposerSaved(dateKey: string): void {
  lastComposerSave = { at: Date.now(), dateKey };
}

export function isRecentComposerSave(dateKey: string, withinMs = 8000): boolean {
  if (!lastComposerSave) return false;
  return lastComposerSave.dateKey === dateKey && Date.now() - lastComposerSave.at < withinMs;
}
