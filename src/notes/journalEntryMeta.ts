import type { FeedProfile } from "./feedMetadata";
import { normalizeFeedProfile } from "./feedMetadata";

export const ENTRY_META_PREFIX = "<!-- udn-entry:";

export type JournalEntryMeta = {
  id: string;
  profile?: FeedProfile;
  context?: string;
  /** Optional Reise-Zuordnung bei Profil wandern (zusätzlich zur Wanderung in context). */
  reise?: string;
  callout?: string;
};

export { profileIconName } from "./profileIcons";

export function generateEntryId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 4; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]!;
  }
  return id;
}

export function profileBubbleClass(profile: FeedProfile | undefined): string {
  if (!profile || profile === "tagebuch") return "";
  return `udn-feedLinkBubble--${profile}`;
}

function parseMetaJson(json: string): JournalEntryMeta | null {
  try {
    const parsed = JSON.parse(json) as Partial<JournalEntryMeta> & { profile?: string };
    const id = parsed.id?.trim() ?? "";
    if (!id) return null;
    const rawProfile = parsed.profile?.trim().toLowerCase() ?? "";
    const profile = rawProfile ? normalizeFeedProfile(rawProfile) : undefined;
    return {
      id,
      ...(profile && profile !== "tagebuch" ? { profile } : {}),
      ...(parsed.context?.trim() ? { context: parsed.context.trim() } : {}),
      ...(parsed.reise?.trim() ? { reise: parsed.reise.trim() } : {}),
      ...(parsed.callout?.trim() ? { callout: parsed.callout.trim() } : {}),
    };
  } catch {
    return null;
  }
}

/** Parse `<!-- udn-entry:{...} -->` from a full journal line. */
export function parseEntryMetaComment(line: string): JournalEntryMeta | null {
  const trimmed = line.trim();
  const idx = trimmed.indexOf(ENTRY_META_PREFIX);
  if (idx < 0) return null;
  const jsonStart = trimmed.indexOf("{", idx);
  const jsonEnd = trimmed.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) return null;
  return parseMetaJson(trimmed.slice(jsonStart, jsonEnd + 1));
}

/** Split inline entry metadata from display text (time + body without comment). */
export function stripEntryMeta(text: string): { body: string; meta: JournalEntryMeta | null } {
  const meta = parseEntryMetaComment(text);
  if (!meta) return { body: text.trim(), meta: null };
  const body = text.replace(/<!--\s*udn-entry:\s*\{[\s\S]*?\}\s*-->/g, "").trim();
  return { body, meta };
}

export function isEntryMetaCommentLine(line: string): boolean {
  const stripped = line.trim().replace(/^>\s*/, "");
  return stripped.startsWith(ENTRY_META_PREFIX) && parseEntryMetaComment(stripped) !== null;
}

/** Remove plugin HTML metadata comments from journal display text. */
export const UDN_META_COMMENT_RE = /\s*<!--\s*udn-[\w-]+:[\s\S]*?-->\s*/g;

export function stripManagedJournalMetaComments(text: string): string {
  return text.replace(UDN_META_COMMENT_RE, " ").replace(/\s{2,}/g, " ").trim();
}

/** Display text for outline / Verweise (no udn-entry or other plugin comments). */
export function stripJournalLineForDisplay(text: string): string {
  return stripManagedJournalMetaComments(stripEntryMeta(text).body);
}

export function formatEntryMetaComment(meta: JournalEntryMeta): string {
  const payload: Record<string, string> = { id: meta.id };
  if (meta.profile && meta.profile !== "tagebuch") payload.profile = meta.profile;
  if (meta.context?.trim()) payload.context = meta.context.trim();
  if (meta.reise?.trim()) payload.reise = meta.reise.trim();
  if (meta.callout?.trim()) payload.callout = meta.callout.trim();
  return `${ENTRY_META_PREFIX}${JSON.stringify(payload)} -->`;
}

/** Append or replace entry metadata on a journal line text. */
export function appendEntryMeta(text: string, meta: JournalEntryMeta | null): string {
  const { body } = stripEntryMeta(text);
  if (!meta?.id) return body;
  const hasProfile = meta.profile && meta.profile !== "tagebuch";
  if (!hasProfile && !meta.context?.trim() && !meta.reise?.trim() && !meta.callout?.trim()) return body;
  return `${body} ${formatEntryMetaComment(meta)}`.trim();
}

export function entryMetaFromProfile(
  profile: FeedProfile | undefined,
  context: string | undefined,
  existingId?: string,
  callout?: string,
  reise?: string,
): JournalEntryMeta | null {
  const id = existingId?.trim() || generateEntryId();
  const ctx = context?.trim() ?? "";
  const trip = reise?.trim() ?? "";
  const prof = profile && profile !== "tagebuch" ? profile : undefined;
  if (!prof && !ctx && !trip && !callout?.trim()) return null;
  return {
    id,
    ...(prof ? { profile: prof } : {}),
    ...(ctx ? { context: ctx } : {}),
    ...((prof === "wandern" || prof === "spaziergang") && trip ? { reise: trip } : {}),
    ...(callout?.trim() ? { callout: callout.trim() } : {}),
  };
}
