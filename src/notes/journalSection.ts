/** Which ## section contains a given line (0-based). */
export function journalHeadingForLine(textLines: string[], lineNum: number): string | null {
  if (lineNum < 0) return null;
  let section: string | null = null;
  const end = Math.min(lineNum, textLines.length - 1);
  for (let i = 0; i <= end; i++) {
    const h2 = textLines[i]?.match(/^##\s+(.+)$/);
    if (h2) section = h2[1]?.trim() ?? null;
  }
  return section;
}

export function dailyNoteLabelToDateKey(label: string): string | null {
  const match = label.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

export function isDailyNoteInDateRange(
  label: string,
  startDateKey: string,
  endDateKey: string,
): boolean {
  const key = dailyNoteLabelToDateKey(label);
  return key != null && key >= startDateKey && key <= endDateKey;
}
