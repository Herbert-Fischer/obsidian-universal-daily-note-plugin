/** Feed metadata for ## Tagebuch entries (outline filtering). */

export type FeedProfile = "tagebuch" | "sonstiges" | "reisen" | "wandern" | "heizung" | "lueftung" | "gedanken";

export type FeedProfileFilter = "alle" | FeedProfile;

export type FeedMetadata = {
  profile: FeedProfile;
  context: string;
};

export const FEED_META_PREFIX = "<!-- udn-feed:";

const PROFILE_ALIASES: Record<string, FeedProfile> = {
  tagebuch: "tagebuch",
  sonstiges: "sonstiges",
  reisen: "reisen",
  wandern: "wandern",
  heizung: "heizung",
  lueftung: "lueftung",
  lüftung: "lueftung",
  gedanken: "gedanken",
};

const HUB_LINK_PROFILE: Record<string, FeedProfile> = {
  "heizungs-tagebuch": "heizung",
  "lüftungs-tagebuch": "lueftung",
  "lueftungs-tagebuch": "lueftung",
  "reise-tagebuch": "reisen",
  "wandern-tagebuch": "wandern",
  "gedanken-inbox": "gedanken",
};

export function normalizeFeedProfile(raw: string): FeedProfile | null {
  const key = raw.trim().toLowerCase();
  return PROFILE_ALIASES[key] ?? null;
}

export function formatFeedMetadataComment(meta: FeedMetadata): string {
  const profile = meta.profile.trim().toLowerCase();
  const context = meta.context.trim();
  if (!context) return `${FEED_META_PREFIX}profile=${profile} -->`;
  const escaped = context.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `${FEED_META_PREFIX}profile=${profile} context="${escaped}" -->`;
}

export function parseFeedMetadataComment(line: string): FeedMetadata | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith(FEED_META_PREFIX)) return null;
  const profileMatch = /profile=([a-zA-ZäöüÄÖÜ]+)/i.exec(trimmed);
  if (!profileMatch?.[1]) return null;
  const profile = normalizeFeedProfile(profileMatch[1]);
  if (!profile) return null;
  const contextMatch = /context="((?:\\.|[^"\\])*)"/.exec(trimmed);
  let context = "";
  if (contextMatch?.[1]) {
    context = contextMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
  }
  return { profile, context };
}

function wikiLinksInText(text: string): string[] {
  const links: string[] = [];
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    links.push(m[1]?.trim().toLowerCase() ?? "");
  }
  return links;
}

/** Infer profile/context from feed line body when no metadata comment exists. */
export function inferFeedMetadataFromLine(text: string): FeedMetadata {
  const links = wikiLinksInText(text);
  for (const link of links) {
    const profile = HUB_LINK_PROFILE[link];
    if (profile) {
      return { profile, context: "" };
    }
  }
  if (links.some((l) => l === "heizung")) return { profile: "heizung", context: "" };
  if (links.some((l) => l === "lüftung" || l === "lueftung")) return { profile: "lueftung", context: "" };
  return { profile: "tagebuch", context: "" };
}

export function resolveFeedMetadata(rawLine: string, text: string): FeedMetadata {
  const fromComment = parseFeedMetadataComment(rawLine.trim()) ?? parseFeedMetadataComment(text.trim());
  if (fromComment) return fromComment;
  return inferFeedMetadataFromLine(text);
}

/** Legacy Sonstiges feeds used profile=tagebuch with context; normalize for display. */
export function effectiveFeedProfile(profile: FeedProfile | undefined, context?: string): FeedProfile {
  const resolved = profile ?? "tagebuch";
  if (resolved === "tagebuch" && context?.trim()) return "sonstiges";
  return resolved;
}

export function feedProfileLabel(profile: FeedProfile): string {
  switch (profile) {
    case "tagebuch":
      return "Tagebuch";
    case "sonstiges":
      return "Sonstiges";
    case "reisen":
      return "Reisen";
    case "wandern":
      return "Wandern";
    case "heizung":
      return "Heizung";
    case "lueftung":
      return "Lüftung";
    case "gedanken":
      return "Gedanken";
  }
}

export function feedProfileFilterLabel(filter: FeedProfileFilter): string {
  if (filter === "alle") return "Alle";
  return feedProfileLabel(filter);
}

export function entryMatchesFeedProfileFilter(
  profile: FeedProfile | undefined,
  filter: FeedProfileFilter,
): boolean {
  if (filter === "alle") return true;
  const resolved = profile ?? "tagebuch";
  return resolved === filter;
}

/** OR filter: empty list = all profiles. */
export function entryMatchesFeedProfileFilters(
  profile: FeedProfile | undefined,
  context: string | undefined,
  filters: FeedProfile[],
): boolean {
  if (filters.length === 0) return true;
  const effective = effectiveFeedProfile(profile, context);
  return filters.includes(effective);
}

export function toggleFeedProfileFilter(filters: FeedProfile[], profile: FeedProfile): FeedProfile[] {
  const set = new Set(filters);
  if (set.has(profile)) set.delete(profile);
  else set.add(profile);
  const order: FeedProfile[] = ["reisen", "wandern", "heizung", "lueftung", "gedanken", "sonstiges"];
  return order.filter((p) => set.has(p));
}

export const OUTLINE_PROFILE_FILTER_OPTIONS: FeedProfile[] = [
  "reisen",
  "wandern",
  "heizung",
  "lueftung",
  "gedanken",
  "sonstiges",
];

export function normalizeOutlineProfileFilters(filters: FeedProfile[]): FeedProfile[] {
  if (!Array.isArray(filters)) return [];
  return OUTLINE_PROFILE_FILTER_OPTIONS.filter((p) => filters.includes(p));
}

/** Safe outline filter list from settings / batch options. */
export function resolveOutlineFeedFilters(filters: FeedProfile[] | undefined | null): FeedProfile[] {
  return normalizeOutlineProfileFilters(Array.isArray(filters) ? filters : []);
}

/** Label for outline toolbar / empty states. */
export function outlineSectionFiltersLabel(
  filters: FeedProfile[],
  includeRestOfTagebuch = false,
): string {
  if (filters.length === 0) return "Alle Abschnitte";
  const base = filters.map((p) => feedProfileLabel(p)).join(" · ");
  return includeRestOfTagebuch ? `${base} + Rest` : base;
}

export function entryMatchesFeedContextFilter(context: string | undefined, filter: string): boolean {
  const q = filter.trim().toLowerCase();
  if (!q) return true;
  return (context ?? "").trim().toLowerCase().includes(q);
}
