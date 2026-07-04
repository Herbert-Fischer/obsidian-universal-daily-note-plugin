import { describe, expect, it, vi } from "vitest";
import {
  buildWandernAttachmentVaultPath,
  buildWandernTrackVaultPath,
  folderFromCalloutTitel,
  gpxFileNameFromCalloutTitel,
  normalizeWandernPhotoPath,
  slugFromWandernTitel,
} from "./attachJournalMedia";

describe("attachJournalMedia wandern", () => {
  it("folderFromCalloutTitel builds vault folder from callout title", () => {
    expect(folderFromCalloutTitel("Wandern: Bläsis Mühle")).toBe("Wandern_Bläsis_Mühle");
    expect(folderFromCalloutTitel("Wandern · Rhön")).toBe("Wandern_Rhön");
  });

  it("slugFromWandernTitel slugifies folder name", () => {
    expect(slugFromWandernTitel("Wandern: Bläsis Mühle")).toBe("wandern_blasis_muhle");
  });

  it("buildWandernAttachmentVaultPath uses Calendar/Anhänge/Bilder/<titel>/NN.ext", () => {
    const path = buildWandernAttachmentVaultPath(
      0,
      "pxl_20260614_082931709portrait.jpg",
      "Wandern: Bläsis Mühle",
    );
    expect(path).toBe("Calendar/Anhänge/Bilder/Wandern_Bläsis_Mühle/01.jpg");
  });

  it("buildWandernTrackVaultPath uses Calendar/Anhänge/GPX/<Callout-Titel>.gpx", () => {
    expect(gpxFileNameFromCalloutTitel("Wandern: Bläsis Mühle")).toBe("Wandern Bläsis Mühle.gpx");
    expect(buildWandernTrackVaultPath("Wandern: Bläsis Mühle")).toBe(
      "Calendar/Anhänge/GPX/Wandern Bläsis Mühle.gpx",
    );
  });

  it("normalizeWandernPhotoPath creates destination folder before rename", async () => {
    const createdFolders: string[] = [];
    const renamed: string[] = [];
    const sourcePath = "Calendar/Attachments/2026-06-14/wandern-01.jpg";
    const destPath = buildWandernAttachmentVaultPath(0, "wandern-01.jpg", "Wandern: Bläsis Mühle");
    const app = {
      vault: {
        getAbstractFileByPath(path: string) {
          if (path === sourcePath) return { extension: "jpg" };
          return null;
        },
        createFolder: vi.fn(async (folder: string) => {
          createdFolders.push(folder);
        }),
        rename: vi.fn(async (_file: unknown, nextPath: string) => {
          renamed.push(nextPath);
        }),
      },
    };

    const result = await normalizeWandernPhotoPath(
      app as never,
      sourcePath,
      0,
      "Wandern: Bläsis Mühle",
      "Calendar/Anhänge/Bilder",
    );

    expect(result).toBe(destPath);
    expect(createdFolders.at(-1)).toBe("Calendar/Anhänge/Bilder/Wandern_Bläsis_Mühle");
    expect(renamed).toEqual([destPath]);
  });
});
