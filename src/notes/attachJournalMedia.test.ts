import { describe, expect, it, vi } from "vitest";
import {
  buildDailyNotePhotoVaultPath,
  buildWandernTrackVaultPath,
  dateKey,
  folderFromCalloutTitel,
  gpxFileNameFromCalloutTitel,
  normalizeDailyNotePhotoPath,
  slugFromWandernTitel,
} from "./attachJournalMedia";

describe("attachJournalMedia daily note photos", () => {
  const date = new Date(2026, 5, 14);

  it("folderFromCalloutTitel strips wiki links from callout titles", () => {
    expect(folderFromCalloutTitel("Lüftungsfilter in den Wohnräumen kontrolliert [[EFH Hettenhausen]] [[Lüftung]]")).toBe(
      "Lüftungsfilter_in_den_Wohnräumen_kontrolliert",
    );
    expect(folderFromCalloutTitel("Grosse Wartung (mit Schimmelentfernung) [[EFH Hettenhausen]] [[Lüftung]]")).toBe(
      "Grosse_Wartung_(mit_Schimmelentfernung)",
    );
    expect(folderFromCalloutTitel("Lüftungsfilter [[EFH Hettenhausen|Kurz]]")).toBe("Lüftungsfilter");
  });

  it("folderFromCalloutTitel builds vault folder from callout title", () => {
    expect(folderFromCalloutTitel("Wandern: Bläsis Mühle")).toBe("Wandern_Bläsis_Mühle");
    expect(folderFromCalloutTitel("Wandern · Rhön")).toBe("Wandern_Rhön");
  });

  it("slugFromWandernTitel slugifies folder name", () => {
    expect(slugFromWandernTitel("Wandern: Bläsis Mühle")).toBe("wandern_blasis_muhle");
  });

  it("buildDailyNotePhotoVaultPath uses Calendar/Anhänge/Bilder/<date>/<titel>_NN.ext", () => {
    const path = buildDailyNotePhotoVaultPath(
      date,
      0,
      "Wandern: Bläsis Mühle",
      "pxl_20260614_082931709portrait.jpg",
    );
    expect(path).toBe(`Calendar/Anhänge/Bilder/${dateKey(date)}/Wandern_Bläsis_Mühle_01.jpg`);
  });

  it("buildWandernTrackVaultPath uses Calendar/Anhänge/GPX/<Callout-Titel>.gpx", () => {
    expect(gpxFileNameFromCalloutTitel("Wandern: Bläsis Mühle")).toBe("Wandern Bläsis Mühle.gpx");
    expect(buildWandernTrackVaultPath("Wandern: Bläsis Mühle")).toBe(
      "Calendar/Anhänge/GPX/Wandern Bläsis Mühle.gpx",
    );
  });

  it("normalizeDailyNotePhotoPath creates destination folder before rename", async () => {
    const createdFolders: string[] = [];
    const renamed: string[] = [];
    const sourcePath = "Calendar/Attachments/2026-06-14/wandern-01.jpg";
    const destPath = buildDailyNotePhotoVaultPath(date, 0, "Wandern: Bläsis Mühle", "wandern-01.jpg");
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

    const result = await normalizeDailyNotePhotoPath(
      app as never,
      sourcePath,
      0,
      date,
      "Wandern: Bläsis Mühle",
      "Calendar/Anhänge/Bilder",
    );

    expect(result).toBe(destPath);
    expect(createdFolders.at(-1)).toBe(`Calendar/Anhänge/Bilder/${dateKey(date)}`);
    expect(renamed).toEqual([destPath]);
  });
});
