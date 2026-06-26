/** Partial wikilink before cursor: `[[`, `[[Page`, `[[Page#`, `[[Page|alias` */
const WIKI_PARTIAL_RE = /\[\[([^\]|#]*(?:#[^\]|]*)?(?:\|[^\]]*)?)$/;

export function wikiQueryBeforeCursor(value: string, cursor: number): string | null {
  const before = value.slice(0, cursor);
  const match = WIKI_PARTIAL_RE.exec(before);
  if (!match) return null;
  return match[1] ?? "";
}

/** Cursor for replacing a partial wikilink; falls back when focus/blur moved selection. */
export function resolveWikiLinkCursor(value: string, cursor: number): number {
  if (wikiQueryBeforeCursor(value, cursor) !== null) return cursor;
  const lastOpen = value.lastIndexOf("[[");
  if (lastOpen < 0) return cursor;
  const tail = value.slice(lastOpen);
  if (/\]\]/.test(tail)) return cursor;
  return value.length;
}

export function replaceWikiPartial(
  value: string,
  cursor: number,
  insertion: string,
): { next: string; cursor: number } {
  const before = value.slice(0, cursor);
  const after = value.slice(cursor);
  const match = WIKI_PARTIAL_RE.exec(before);
  if (!match) return { next: value, cursor };
  const start = before.length - match[0].length;
  const next = before.slice(0, start) + insertion + after;
  return { next, cursor: start + insertion.length };
}
