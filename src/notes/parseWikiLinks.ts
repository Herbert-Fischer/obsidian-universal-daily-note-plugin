export type WikiLinkSegment =
  | { kind: "text"; value: string }
  | { kind: "link"; dest: string; label: string };

const WIKI_LINK_RE = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;

/** Split journal line text into plain text and wikilink segments. */
export function parseWikiLinks(text: string): WikiLinkSegment[] {
  const out: WikiLinkSegment[] = [];
  let last = 0;

  for (const match of text.matchAll(WIKI_LINK_RE)) {
    const index = match.index ?? 0;
    if (index > last) {
      out.push({ kind: "text", value: text.slice(last, index) });
    }
    const page = match[1]?.trim() ?? "";
    const heading = match[2]?.trim();
    const alias = match[3]?.trim();
    const dest = heading ? `${page}#${heading}` : page;
    const label = alias || page + (heading ? ` › ${heading}` : "");
    if (dest) out.push({ kind: "link", dest, label });
    last = index + match[0].length;
  }

  if (last < text.length) {
    out.push({ kind: "text", value: text.slice(last) });
  }

  return out.length > 0 ? out : [{ kind: "text", value: text }];
}
