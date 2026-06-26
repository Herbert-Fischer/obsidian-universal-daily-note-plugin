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

/** Rebuild stored journal line text from editable time + body fields. */
export function formatJournalEntryText(time: string | null | undefined, body: string): string {
  const trimmedBody = body.trim();
  const trimmedTime = time?.trim() ?? "";
  if (trimmedTime && trimmedBody) return `${trimmedTime} ${trimmedBody}`;
  if (trimmedTime) return trimmedTime;
  return trimmedBody;
}

function timeSortMinutes(time: string | null | undefined): number | null {
  const trimmed = time?.trim() ?? "";
  if (!trimmed) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Minutes since midnight from a journal line, or null when no valid HH:mm prefix. */
export function journalEntrySortMinutes(text: string): number | null {
  return timeSortMinutes(parseJournalEntryDisplay(text).time);
}

/** Sort journal lines by leading HH:mm; lines without time keep their relative order at the end. */
export function sortJournalEntryTexts(entryTexts: string[]): string[] {
  const indexed = entryTexts.map((text, index) => ({
    text,
    index,
    minutes: journalEntrySortMinutes(text),
  }));
  indexed.sort((a, b) => {
    if (a.minutes != null && b.minutes != null) {
      return a.minutes - b.minutes || a.index - b.index;
    }
    if (a.minutes != null) return -1;
    if (b.minutes != null) return 1;
    return a.index - b.index;
  });
  return indexed.map((item) => item.text);
}
