import type { ComposerEntry } from "../../notes/dailyComposer";
import type { ReisenSortOrder } from "../../notes/reisenComposer";

export type ComposerDraftSnapshot = {
  dateKey: string;
  heading: string;
  entries: ComposerEntry[];
  summary: string;
  calloutTitle: string;
  listPhotos: string[];
  reiseSortOrder: Record<string, ReisenSortOrder>;
  summaryTouched: boolean;
  newEntryText: string;
  newEntryTime: string;
  wandernTitel: string;
};

let draft: ComposerDraftSnapshot | null = null;

export function saveComposerDraft(snapshot: ComposerDraftSnapshot): void {
  draft = snapshot;
}

export function peekComposerDraft(dateKey: string, heading: string): ComposerDraftSnapshot | null {
  if (!draft) return null;
  if (draft.dateKey !== dateKey) return null;
  if (draft.heading.toLowerCase() !== heading.toLowerCase()) return null;
  return draft;
}

export function clearComposerDraft(): void {
  draft = null;
}
