import { describe, expect, it } from "vitest";
import { DEFAULT_TRACKS_FOLDER, resolveTracksFolder, tracksFolderForTemplatePack } from "./resolveTracksFolder";
import type { WandernLayoutSettings } from "../settings";

const layout = (tracksFolder: string): WandernLayoutSettings => ({
  template: "",
  maxPhotos: 3,
  track3dEnabled: true,
  track3dHeight: 400,
  track3dElevationExaggeration: 4,
  photosFolder: "Calendar/Anhänge/Bilder",
  tracksFolder,
});

describe("resolveTracksFolder", () => {
  it("uses profile-specific GPX folders", () => {
    const wandern = layout("Calendar/Wandern/GPX");
    const spaziergang = layout("Calendar/Spaziergang/GPX");
    expect(resolveTracksFolder(wandern, spaziergang, "wandern")).toBe("Calendar/Wandern/GPX");
    expect(resolveTracksFolder(wandern, spaziergang, "spaziergang")).toBe("Calendar/Spaziergang/GPX");
  });

  it("falls back to wandern folder for reisen bulk templates", () => {
    const wandern = layout("Calendar/Anhänge/GPX");
    const spaziergang = layout("Calendar/Other/GPX");
    expect(tracksFolderForTemplatePack("reisen-bulk", wandern, spaziergang)).toBe("Calendar/Anhänge/GPX");
    expect(tracksFolderForTemplatePack("wandern-bulk", wandern, spaziergang)).toBe("Calendar/Anhänge/GPX");
    expect(tracksFolderForTemplatePack("spaziergang-bulk", wandern, spaziergang)).toBe(
      "Calendar/Other/GPX",
    );
  });

  it("uses default when folders are empty", () => {
    const empty = layout("");
    expect(resolveTracksFolder(empty, empty, "wandern")).toBe(DEFAULT_TRACKS_FOLDER);
  });
});
