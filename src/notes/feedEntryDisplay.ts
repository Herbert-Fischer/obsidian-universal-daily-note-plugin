import { effectiveFeedProfile, feedProfileLabel, type FeedProfile } from "./feedMetadata";
import { stripJournalLineForDisplay } from "./journalEntryMeta";
import { parseWikiLinks, type WikiLinkSegment } from "./parseWikiLinks";
import { parseJournalLinks } from "./parseJournalLinks";

export type FeedEntrySuffixSplit = {
  lead: string;
  links: WikiLinkSegment[];
};

export type DisplayLinkSegment =
  | { kind: "text"; value: string }
  | { kind: "link"; dest: string; label: string }
  | { kind: "url"; href: string; label: string };

const PAREN_LINK_GROUP = /\(([^()]*\[\[[^\]]+\]\][^()]*)\)\s*$/;
const OPEN_PAREN_BEFORE_LINK = /\(\s*$/;
const CLOSE_PAREN_AFTER_LINK = /^\s*\)/;

const HUB_BUBBLE_CLASS: Record<string, string> = {
  "heizungs-tagebuch": "udn-feedLinkBubble--heizung",
  "lüftungs-tagebuch": "udn-feedLinkBubble--lueftung",
  "lueftungs-tagebuch": "udn-feedLinkBubble--lueftung",
  "reise-tagebuch": "udn-feedLinkBubble--reisen",
  "wandern-tagebuch": "udn-feedLinkBubble--wandern",
  "gedanken-inbox": "udn-feedLinkBubble--gedanken",
};

function wikiLinksFromInner(text: string): Extract<WikiLinkSegment, { kind: "link" }>[] {
  const links: Extract<WikiLinkSegment, { kind: "link" }>[] = [];
  for (const match of text.matchAll(/\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g)) {
    const page = match[1]?.trim() ?? "";
    const heading = match[2]?.trim();
    const alias = match[3]?.trim();
    const dest = heading ? `${page}#${heading}` : page;
    const label = alias || page + (heading ? ` › ${heading}` : "");
    if (dest) links.push({ kind: "link", dest, label });
  }
  return links;
}

/** Split trailing feed suffix `( [[…]] ) ( [[…]] )` from display body. */
export function splitFeedEntrySuffix(body: string): FeedEntrySuffixSplit {
  let rest = body.trim();
  const links: WikiLinkSegment[] = [];

  for (;;) {
    const match = PAREN_LINK_GROUP.exec(rest);
    if (!match) break;
    const inner = match[1] ?? "";
    const groupLinks = wikiLinksFromInner(inner);
    if (groupLinks.length === 0) break;
    links.unshift(...groupLinks);
    rest = rest.slice(0, match.index).trim();
  }

  return { lead: rest, links };
}

/** Wiki-link segments for display — links stay at their position in the sentence. */
export function displayWikiLinkSegments(body: string): DisplayLinkSegment[] {
  const cleaned = stripJournalLineForDisplay(body);
  const raw = parseJournalLinks(cleaned).map((seg) => {
    if (seg.kind === "wiki") return { kind: "link" as const, dest: seg.dest, label: seg.label };
    if (seg.kind === "url") return { kind: "url" as const, href: seg.href, label: seg.label };
    return { kind: "text" as const, value: seg.value };
  });
  const out: DisplayLinkSegment[] = [];

  for (let i = 0; i < raw.length; i++) {
    const seg = raw[i]!;
    if (seg.kind === "link" || seg.kind === "url") {
      out.push(seg);
      continue;
    }

    let value = seg.value;
    const next = raw[i + 1];
    const prev = out[out.length - 1];

    if ((next?.kind === "link" || next?.kind === "url") && OPEN_PAREN_BEFORE_LINK.test(value)) {
      value = value.replace(OPEN_PAREN_BEFORE_LINK, "");
    }
    if ((prev?.kind === "link" || prev?.kind === "url") && CLOSE_PAREN_AFTER_LINK.test(value)) {
      value = value.replace(CLOSE_PAREN_AFTER_LINK, "");
    }

    if (value) out.push({ kind: "text", value });
  }

  return out.length > 0 ? out : [{ kind: "text", value: body }];
}

export function bodyHasWikiLinks(body: string): boolean {
  return displayWikiLinkSegments(body).some((seg) => seg.kind === "link" || seg.kind === "url");
}

/** Split all wiki links from body; remaining text is lead (legacy suffix extraction). */
export function splitAllEntryLinks(body: string): FeedEntrySuffixSplit {
  const segments = parseWikiLinks(body.trim());
  const links: WikiLinkSegment[] = [];
  const leadParts: string[] = [];

  for (const seg of segments) {
    if (seg.kind === "link") {
      links.push(seg);
    } else {
      leadParts.push(seg.value);
    }
  }

  let lead = leadParts.join("").replace(/\s+/g, " ").trim();
  lead = lead.replace(/\(\s*\)/g, "").replace(/\s·\s*$/g, "").trim();

  return { lead, links };
}

export function entryLinkSplit(body: string, feedProfile: FeedProfile | undefined): FeedEntrySuffixSplit {
  const all = splitAllEntryLinks(body);
  if (all.links.length > 0) return all;
  if (feedProfile && feedProfile !== "tagebuch") return splitFeedEntrySuffix(body);
  return { lead: body.trim(), links: [] };
}

/** Prefer parenthesized feed suffix groups; fall back to inline wiki links. */
export function displayLinkSplit(body: string, feedProfile?: FeedProfile): FeedEntrySuffixSplit {
  const suffix = splitFeedEntrySuffix(body);
  if (suffix.links.length > 0) return suffix;
  return entryLinkSplit(body, feedProfile);
}

export function entryShowsFeedLinkBubbles(_feedProfile: FeedProfile | undefined, body: string): boolean {
  return bodyHasWikiLinks(body);
}

export type FeedSourceBadge = {
  label: string;
  className: string;
  title: string;
};

/** Non-link badge for Tagebuch feed rows sourced from another ## callout (Sonstiges, Reisen, …). */
export function feedSourceBadge(profile: FeedProfile | undefined, context?: string): FeedSourceBadge | null {
  const effective = effectiveFeedProfile(profile, context);
  if (effective === "tagebuch") return null;
  const ctx = context?.trim() ?? "";
  return {
    label: feedProfileLabel(effective),
    className: `udn-feedLinkBubble--${effective}`,
    title: ctx || `Aus ${feedProfileLabel(effective)}`,
  };
}

export function feedLinkBubbleClass(dest: string, feedProfile?: FeedProfile, broken = false): string {
  const page = dest.split("#")[0]?.trim().toLowerCase() ?? "";
  if (broken) return "udn-feedLinkBubble--broken";
  if (HUB_BUBBLE_CLASS[page]) return HUB_BUBBLE_CLASS[page]!;
  if (page.includes("heizung")) return "udn-feedLinkBubble--heizung";
  if (page.includes("lüftung") || page.includes("lueftung")) return "udn-feedLinkBubble--lueftung";
  if (page.includes("reise")) return "udn-feedLinkBubble--reisen";
  if (page.includes("wandern")) return "udn-feedLinkBubble--wandern";
  if (page.includes("gedanken")) return "udn-feedLinkBubble--gedanken";
  if (feedProfile && feedProfile !== "tagebuch") return `udn-feedLinkBubble--${feedProfile}`;
  return "udn-feedLinkBubble--default";
}
