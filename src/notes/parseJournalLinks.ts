export type JournalLinkSegment =
  | { kind: "text"; value: string }
  | { kind: "wiki"; dest: string; label: string }
  | { kind: "url"; href: string; label: string };

const WIKI_LINK_RE = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;
const MD_LINK_RE = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const BARE_URL_RE = /\b(https?:\/\/[^\s<>()]+|www\.[^\s<>()]+)\b/g;

type LinkMatch = {
  index: number;
  end: number;
  segment: Extract<JournalLinkSegment, { kind: "wiki" | "url" }>;
};

function wikiMatches(text: string): LinkMatch[] {
  const out: LinkMatch[] = [];
  for (const match of text.matchAll(WIKI_LINK_RE)) {
    const index = match.index ?? 0;
    const page = match[1]?.trim() ?? "";
    const heading = match[2]?.trim();
    const alias = match[3]?.trim();
    const dest = heading ? `${page}#${heading}` : page;
    const label = alias || page + (heading ? ` › ${heading}` : "");
    if (!dest) continue;
    out.push({
      index,
      end: index + match[0].length,
      segment: { kind: "wiki", dest, label },
    });
  }
  return out;
}

function markdownUrlMatches(text: string): LinkMatch[] {
  const out: LinkMatch[] = [];
  for (const match of text.matchAll(MD_LINK_RE)) {
    const index = match.index ?? 0;
    const label = match[1]?.trim() ?? "";
    const href = match[2]?.trim() ?? "";
    if (!label || !href) continue;
    out.push({
      index,
      end: index + match[0].length,
      segment: { kind: "url", href, label },
    });
  }
  return out;
}

function bareUrlMatches(text: string): LinkMatch[] {
  const out: LinkMatch[] = [];
  for (const match of text.matchAll(BARE_URL_RE)) {
    const index = match.index ?? 0;
    let raw = (match[1] ?? "").trim();
    if (!raw) continue;
    // trim common trailing punctuation (markdown often wraps URLs in parentheses)
    raw = raw.replace(/[)\].,;:!?]+$/g, "");
    const href = raw.startsWith("www.") ? `https://${raw}` : raw;
    out.push({
      index,
      end: index + (match[1] ?? "").length,
      segment: { kind: "url", href, label: raw },
    });
  }
  return out;
}

function nonOverlappingMatches(text: string): LinkMatch[] {
  const sorted = [...wikiMatches(text), ...markdownUrlMatches(text), ...bareUrlMatches(text)].sort(
    (a, b) => a.index - b.index || a.end - b.end,
  );
  const out: LinkMatch[] = [];
  let lastEnd = 0;
  for (const match of sorted) {
    if (match.index < lastEnd) continue;
    out.push(match);
    lastEnd = match.end;
  }
  return out;
}

/** Split journal line text into plain text, wikilinks, and markdown URL links. */
export function parseJournalLinks(text: string): JournalLinkSegment[] {
  const matches = nonOverlappingMatches(text);
  if (matches.length === 0) return [{ kind: "text", value: text }];

  const out: JournalLinkSegment[] = [];
  let last = 0;
  for (const match of matches) {
    if (match.index > last) {
      out.push({ kind: "text", value: text.slice(last, match.index) });
    }
    out.push(match.segment);
    last = match.end;
  }
  if (last < text.length) {
    out.push({ kind: "text", value: text.slice(last) });
  }
  return out;
}
