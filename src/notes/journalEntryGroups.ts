import type { App, TFile } from "obsidian";
import type { DailyNoteFallbackSettings, TagebuchVerweiseSettings } from "../settings";
import { DEFAULT_JOURNAL_HEADING } from "../settings";
import { listDailyNoteFilesInFolder } from "./dailyNoteFallbackPaths";
import { parseEntryMetaComment } from "./journalEntryMeta";
import type { FeedProfile } from "./feedMetadata";
import { effectiveFeedProfile } from "./feedMetadata";
import { journalProfileForHeading } from "./journalProfiles";

const ENTRY_CONTEXT_RE = /<!--\s*udn-entry:\s*(\{[\s\S]*?\})\s*-->/g;

/** User-facing label for the grouping field (stored as `context` in udn-entry). */
export function groupFieldLabel(profile: FeedProfile | undefined): string {
  switch (profile) {
    case "reisen":
      return "Reise";
    case "wandern":
      return "Wanderung";
    case "heizung":
      return "Vorfall";
    case "lueftung":
      return "Wartung";
    case "gedanken":
      return "Thema";
    case "sonstiges":
      return "Thema";
    default:
      return "Gruppe";
  }
}

export function groupFieldPlaceholder(profile: FeedProfile | undefined): string {
  switch (profile) {
    case "reisen":
      return "z. B. Mamas 90ter Geburtstag";
    case "wandern":
      return "z. B. Wasserkuppe Runde";
    case "heizung":
      return "z. B. Brennerausfall";
    case "lueftung":
      return "z. B. Filterwechsel 2026";
    case "gedanken":
      return "z. B. Obsidian, Haushalt";
    case "sonstiges":
      return "z. B. Lilien von Otto";
    default:
      return "Name der Gruppe";
  }
}

export function groupFieldHint(profile: FeedProfile | undefined): string {
  const label = groupFieldLabel(profile);
  return `${label}: Einträge mit gleichem Namen werden in der Outline zusammengefasst und in den ${label}-Hubs gefiltert.`;
}

export function collectGroupLabelsFromText(text: string, profile?: FeedProfile): string[] {
  const labels = new Set<string>();
  for (const match of text.matchAll(ENTRY_CONTEXT_RE)) {
    const meta = parseEntryMetaComment(`<!-- udn-entry:${match[1]} -->`);
    if (!meta?.context?.trim()) continue;
    if (profile && meta.profile && meta.profile !== profile) continue;
    if (!profile && meta.profile && meta.profile !== "tagebuch") {
      labels.add(meta.context.trim());
      continue;
    }
    if (!profile || meta.profile === profile) {
      labels.add(meta.context.trim());
    }
  }
  return [...labels].sort((a, b) => a.localeCompare(b, "de"));
}

export async function loadRecentGroupLabels(
  app: App,
  fallback: DailyNoteFallbackSettings,
  tagebuch: TagebuchVerweiseSettings,
  profile: FeedProfile,
  maxFiles = 120,
): Promise<string[]> {
  const folder = tagebuch.dailyNotesFolder?.trim() || fallback.folder.trim();
  const format = fallback.filenameFormat.trim() || "YYYY-MM-DD";
  const files = listDailyNoteFilesInFolder(app, folder, format)
    .sort((a, b) => b.basename.localeCompare(a.basename))
    .slice(0, maxFiles);

  const labels = new Set<string>();
  await Promise.all(
    files.map(async (file: TFile) => {
      try {
        const text = await app.vault.read(file);
        for (const label of collectGroupLabelsFromText(text, profile)) {
          labels.add(label);
        }
      } catch {
        /* skip */
      }
    }),
  );
  return [...labels].sort((a, b) => a.localeCompare(b, "de"));
}

/** Map ## section heading to feed profile for Tagebuch-first outline filtering. */
export function feedProfileForSectionHeading(heading: string): FeedProfile | null {
  const key = heading.trim().toLowerCase();
  if (key === DEFAULT_JOURNAL_HEADING.toLowerCase()) return null;
  if (key === "sonstiges") return "sonstiges";
  const profile = journalProfileForHeading(heading);
  return profile?.id ?? null;
}

export function entryMatchesProfileFilter(
  entryProfile: FeedProfile | undefined,
  entryContext: string | undefined,
  filter: FeedProfile,
): boolean {
  const effective = effectiveFeedProfile(entryProfile, entryContext);
  return effective === filter;
}
