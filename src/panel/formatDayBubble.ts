/** Format YYYY-MM-DD (or daily-note basename) as DD.MM.YY bubble label. */
export function formatDayBubbleLabel(dateKey: string): string {
  const stem = dateKey.replace(/\.md$/i, "").replace(/\s+\[conflicted\]$/i, "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(stem);
  if (!match) return dateKey;
  return `${match[3]}.${match[2]}.${match[1]!.slice(-2)}`;
}

/** Stable hue for row tinting from a daily-note date key. */
export function entryHueFromDateKey(dateKey: string): number {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

/** Spread hues across a flat list (Verweise). */
export function entryHueFromIndex(index: number): number {
  return (index * 37) % 360;
}
