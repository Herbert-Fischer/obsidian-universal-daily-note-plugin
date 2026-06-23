const LEADING_TIME_RE = /^(\d{1,2}:\d{2})\s+(.*)$/;

export type JournalEntryDisplay = {
  time: string | null;
  body: string;
};

/** Split optional leading HH:mm from journal line display text. */
export function parseJournalEntryDisplay(text: string): JournalEntryDisplay {
  const trimmed = text.trim();
  const match = LEADING_TIME_RE.exec(trimmed);
  if (!match) return { time: null, body: trimmed };
  return { time: match[1] ?? null, body: (match[2] ?? "").trim() };
}
