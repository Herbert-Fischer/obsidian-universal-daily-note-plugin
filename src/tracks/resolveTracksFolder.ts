import type { FeedProfile } from "../notes/feedMetadata";
import type { WandernLayoutSettings } from "../settings";

export const DEFAULT_TRACKS_FOLDER = "Calendar/Anhänge/GPX";

export function resolveTracksFolder(
  wandernLayout: WandernLayoutSettings,
  spaziergangLayout: WandernLayoutSettings,
  profile?: FeedProfile | null,
): string {
  if (profile === "spaziergang") {
    return spaziergangLayout.tracksFolder?.trim() || DEFAULT_TRACKS_FOLDER;
  }
  if (profile === "wandern") {
    return wandernLayout.tracksFolder?.trim() || DEFAULT_TRACKS_FOLDER;
  }
  return (
    wandernLayout.tracksFolder?.trim() ||
    spaziergangLayout.tracksFolder?.trim() ||
    DEFAULT_TRACKS_FOLDER
  );
}

export function tracksFolderForTemplatePack(
  packId: string,
  wandernLayout: WandernLayoutSettings,
  spaziergangLayout: WandernLayoutSettings,
): string {
  if (packId === "spaziergang-bulk") {
    return resolveTracksFolder(wandernLayout, spaziergangLayout, "spaziergang");
  }
  if (packId === "wandern-bulk") {
    return resolveTracksFolder(wandernLayout, spaziergangLayout, "wandern");
  }
  return resolveTracksFolder(wandernLayout, spaziergangLayout);
}
