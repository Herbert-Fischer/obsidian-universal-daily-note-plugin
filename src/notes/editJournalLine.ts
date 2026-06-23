import { TFile, type App } from "obsidian";

export function rebuildJournalBulletLine(rawLine: string, newText: string): string {
  const trimmed = rawLine.trimEnd();
  const match = trimmed.match(/^((?:>\s*)?[-*+]\s+)(.*)$/);
  if (match) {
    const indent = rawLine.match(/^(\s*)/)?.[1] ?? "";
    const prefix = match[1] ?? "- ";
    return `${indent}${prefix}${newText.trim()}`;
  }
  const indent = rawLine.match(/^(\s*)/)?.[1] ?? "";
  return `${indent}- ${newText.trim()}`;
}

export async function updateJournalLine(
  app: App,
  filePath: string,
  lineNumber: number,
  rawLine: string,
  newText: string,
): Promise<boolean> {
  const file = app.vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) return false;

  const next = newText.trim();
  if (!next) return false;

  await app.vault.process(file, (data) => {
    const lines = data.split("\n");
    if (lineNumber < 0 || lineNumber >= lines.length) return data;
    lines[lineNumber] = rebuildJournalBulletLine(rawLine, next);
    return lines.join("\n");
  });

  return true;
}
