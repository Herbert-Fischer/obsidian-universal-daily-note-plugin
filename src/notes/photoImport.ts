import type { App } from "obsidian";
import { normalizePath } from "obsidian";
import type { FeedDetailLayoutSettings, WandernLayoutSettings } from "../settings";
import {
  buildAttachmentVaultPath,
  buildWandernAttachmentVaultPath,
  importAttachmentFile,
  importWandernAttachmentFile,
} from "./attachJournalMedia";
import { importFeedDetailPhotoFile } from "./feedDetailComposer";
import type { JournalProfileDef } from "./journalProfiles";
import { journalProfileForHeading } from "./journalProfiles";
import { lueftungPhotosFolderForYear } from "./journalProfiles";

export type PhotoImportContext = {
  date: Date;
  calloutTitle: string;
  heading: string;
  photoIndex: number;
  attachmentsFolder?: string;
  wandernLayout?: WandernLayoutSettings;
  feedDetailLayout?: FeedDetailLayoutSettings;
};

function profileForContext(ctx: PhotoImportContext): JournalProfileDef | null {
  return journalProfileForHeading(ctx.heading);
}

function photosFolderForProfile(
  profile: JournalProfileDef,
  ctx: PhotoImportContext,
): string {
  if (profile.id === "wandern") {
    return ctx.wandernLayout?.photosFolder?.trim() || profile.photosFolder;
  }
  if (profile.id === "heizung") {
    return ctx.feedDetailLayout?.heizungPhotosFolder.trim() || profile.photosFolder;
  }
  if (profile.id === "lueftung") {
    const base = ctx.feedDetailLayout?.lueftungPhotosFolder.trim() || profile.photosFolder;
    return lueftungPhotosFolderForYear(base, ctx.date.getFullYear());
  }
  return ctx.attachmentsFolder?.trim() || "Attachments";
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
  const parts = folderPath.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}

async function importListPhotoFile(
  app: App,
  file: File,
  ctx: PhotoImportContext,
): Promise<string> {
  const folder = photosFolderForProfile(
    journalProfileForHeading(ctx.heading) ?? {
      id: "tagebuch",
      label: ctx.heading,
      kind: "list",
      hubLink: "",
      feedSuffix: "",
      photosFolder: ctx.attachmentsFolder ?? "Attachments",
      maxPhotos: 6,
    },
    ctx,
  );
  let destPath = buildAttachmentVaultPath(ctx.date, folder, file.name);
  const parent = destPath.replace(/\/[^/]+$/, "");
  await ensureFolder(app, parent);
  if (app.vault.getAbstractFileByPath(destPath)) {
    const dot = destPath.lastIndexOf(".");
    const stem = dot >= 0 ? destPath.slice(0, dot) : destPath;
    const ext = dot >= 0 ? destPath.slice(dot) : "";
    destPath = `${stem}-${Math.random().toString(36).slice(2, 4)}${ext}`;
  }
  const data = await file.arrayBuffer();
  await app.vault.createBinary(destPath, data);
  return normalizePath(destPath);
}

/** Unified photo import for all composer modes. */
export async function importJournalPhoto(app: App, file: File, ctx: PhotoImportContext): Promise<string> {
  const profile = profileForContext(ctx);

  if (profile?.id === "wandern") {
    return importWandernAttachmentFile(
      app,
      file,
      ctx.photoIndex,
      ctx.calloutTitle.trim() || "Wandern",
      ctx.wandernLayout?.photosFolder ?? profile.photosFolder,
    );
  }

  if (profile && (profile.id === "heizung" || profile.id === "lueftung") && ctx.feedDetailLayout) {
    return importFeedDetailPhotoFile(
      app,
      file,
      ctx.photoIndex,
      ctx.date,
      profile,
      ctx.feedDetailLayout,
    );
  }

  if (profile?.kind === "list" || !profile) {
    return importListPhotoFile(app, file, ctx);
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
