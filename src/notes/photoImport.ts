import type { App } from "obsidian";
import type { FeedDetailLayoutSettings, WandernLayoutSettings } from "../settings";
import {
  DEFAULT_DAILY_PHOTOS_FOLDER,
  importAttachmentFile,
  importDailyNotePhotoFile,
} from "./attachJournalMedia";
import type { JournalProfileDef } from "./journalProfiles";
import { journalProfileById, journalProfileForHeading } from "./journalProfiles";

export type PhotoImportContext = {
  date: Date;
  calloutTitle: string;
  heading: string;
  photoIndex: number;
  attachmentsFolder?: string;
  wandernLayout?: WandernLayoutSettings;
  feedDetailLayout?: FeedDetailLayoutSettings;
  /** Per-entry Lüftung callout title for attachment subfolder. */
  lueftungEntryTitle?: string;
  /** Per-entry Heizung callout title for attachment subfolder. */
  heizungEntryTitle?: string;
  /** Per-entry Wandern callout title for attachment subfolder. */
  wandernEntryTitle?: string;
};

function profileForContext(ctx: PhotoImportContext): JournalProfileDef | null {
  return journalProfileForHeading(ctx.heading);
}

function dailyPhotosFolder(ctx: PhotoImportContext): string {
  if (ctx.lueftungEntryTitle?.trim()) {
    return journalProfileById("lueftung")?.photosFolder.trim() || DEFAULT_DAILY_PHOTOS_FOLDER;
  }
  if (ctx.heizungEntryTitle?.trim()) {
    return journalProfileById("heizung")?.photosFolder.trim() || DEFAULT_DAILY_PHOTOS_FOLDER;
  }
  if (ctx.wandernEntryTitle?.trim()) {
    return journalProfileById("wandern")?.photosFolder.trim() || DEFAULT_DAILY_PHOTOS_FOLDER;
  }
  const profile = profileForContext(ctx);
  if (profile?.id === "lueftung" || profile?.id === "heizung" || profile?.id === "reisen") {
    return profile.photosFolder.trim() || DEFAULT_DAILY_PHOTOS_FOLDER;
  }
  return (
    ctx.wandernLayout?.photosFolder?.trim() ||
    ctx.feedDetailLayout?.heizungPhotosFolder.trim() ||
    DEFAULT_DAILY_PHOTOS_FOLDER
  );
}

function calloutTitleForImport(ctx: PhotoImportContext): string {
  return (
    ctx.lueftungEntryTitle?.trim() ||
    ctx.heizungEntryTitle?.trim() ||
    ctx.wandernEntryTitle?.trim() ||
    ctx.calloutTitle.trim() ||
    ctx.heading.trim() ||
    "Tagebuch"
  );
}

/** Unified photo import for all composer modes. */
export async function importJournalPhoto(app: App, file: File, ctx: PhotoImportContext): Promise<string> {
  const profile = profileForContext(ctx);

  if (profile?.id === "wandern" || profile?.id === "lueftung" || profile?.id === "heizung" || profile?.kind === "list" || !profile) {
    return importDailyNotePhotoFile(
      app,
      file,
      ctx.date,
      ctx.photoIndex,
      calloutTitleForImport(ctx),
      dailyPhotosFolder(ctx),
    );
  }

  return importAttachmentFile(app, file, ctx.date, ctx.attachmentsFolder ?? "Attachments");
}

export function maxPhotosForHeading(
  heading: string,
  options: {
    wandernLayout?: WandernLayoutSettings;
    feedDetailLayout?: FeedDetailLayoutSettings;
    defaultMax?: number;
  },
): number {
  const profile = journalProfileForHeading(heading);
  if (profile?.id === "wandern") {
    return Math.max(1, options.wandernLayout?.maxPhotos ?? profile.maxPhotos);
  }
  if (profile && (profile.id === "heizung" || profile.id === "lueftung")) {
    return Math.max(1, options.feedDetailLayout?.maxPhotos ?? profile.maxPhotos);
  }
  return Math.max(1, options.defaultMax ?? profile?.maxPhotos ?? 6);
}
