import { describe, expect, it } from "vitest";
import type { App, TFile } from "obsidian";
import { buildDailyNotePhotoVaultPath } from "./attachJournalMedia";
import {
  isLegacyAttachmentPhotoPath,
  isLegacyDailyNotePhotoPath,
  isLegacyWandernFolderPhotoPath,
  migrateDailyNotePhotoFile,
  parseDailyNoteDateFromPath,
} from "./migrateDailyNotePhotos";
import { isMisplacedDailyNotePhotoPath } from "./attachJournalMedia";

describe("migrateDailyNotePhotos", () => {
  it("detects legacy attachment paths", () => {
    expect(isLegacyAttachmentPhotoPath("Calendar/Attachments/2026-07-02/a.jpg")).toBe(true);
    expect(isLegacyDailyNotePhotoPath("Calendar/Attachments/2026-07-02/a.jpg")).toBe(true);
    expect(isLegacyAttachmentPhotoPath("Calendar/Anhänge/Bilder/2026-07-02/Tagebuch_01.jpg")).toBe(false);
  });

  it("detects legacy wandern folder paths", () => {
    expect(isLegacyWandernFolderPhotoPath("Calendar/Anhänge/Bilder/Wandern_Bläsis_Mühle/01.jpg")).toBe(true);
    expect(isLegacyWandernFolderPhotoPath("Calendar/Anhänge/Bilder/2026-06-14/Wandern_Bläsis_Mühle_01.jpg")).toBe(
      false,
    );
    expect(isLegacyWandernFolderPhotoPath("Calendar/Anhänge/Bilder/GarminConnect.jpg")).toBe(false);
  });

  it("parses date from daily note path", () => {
    const date = parseDailyNoteDateFromPath("Calendar/Notes/2026-07-03.md");
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(6);
    expect(date?.getDate()).toBe(3);
  });

  it("rewrites embeds and moves legacy files", async () => {
    const date = new Date(2026, 6, 3);
    const calloutTitle = "03.07.2026 · bewölkt, Gersfeld";
    const oldPath = "Calendar/Attachments/2026-07-03/000000-photo.jpg";
    const newPath = buildDailyNotePhotoVaultPath(date, 0, calloutTitle, oldPath);
    let disk = [
      "## Tagebuch",
      "",
      `> [!tagebuch-ref] ${calloutTitle}`,
      `> > ![[${oldPath}]]`,
      "",
      `<!-- udn-photos: {"fotos":["${oldPath}"],"layout":"gallery-row"} -->`,
    ].join("\n");

    const renamed: Array<{ from: string; to: string }> = [];
    const app = {
      vault: {
        read: async () => disk,
        modify: async (_file: TFile, content: string) => {
          disk = content;
        },
        getAbstractFileByPath(path: string) {
          if (path === oldPath) return { extension: "jpg" };
          return null;
        },
        createFolder: async () => {},
        rename: async (_file: unknown, to: string) => {
          renamed.push({ from: oldPath, to });
        },
      },
    } as unknown as App;

    const result = await migrateDailyNotePhotoFile(app, { path: "Calendar/Notes/2026-07-03.md" } as TFile);
    expect(result.moved).toBe(1);
    expect(disk).toContain(newPath);
    expect(disk).not.toContain(oldPath);
    expect(renamed[0]?.to).toBe(newPath);
  });

  it("detects misplaced +/ and bracket filenames", () => {
    expect(isMisplacedDailyNotePhotoPath("+/Bildschirmfoto_20260704_130700.jpg")).toBe(true);
    expect(
      isMisplacedDailyNotePhotoPath(
        "Atlas/Immobilien/EFH Hettenhausen/Anhänge/Lueftung/Wartungsprotokoll Fotos/2026-05-06/Grosse_Wartung_(mit_Schimmelentfernung)_[[EFH_Hettenhausen]]_[[L_01.jpg",
      ),
    ).toBe(true);
    expect(
      isMisplacedDailyNotePhotoPath(
        "Atlas/Immobilien/EFH Hettenhausen/Anhänge/Lueftung/Wartungsprotokoll Fotos/2026-05-06/Grosse_Wartung_(mit_Schimmelentfernung)_EFH_Hettenhausen_Lüftung_01.jpg",
      ),
    ).toBe(true);
  });

  it("rewrites legacy wandern folder embeds", async () => {
    const date = new Date(2026, 5, 14);
    const titel = "Wandern: Bläsis Mühle";
    const oldPaths = [
      "Calendar/Anhänge/Bilder/Wandern_Bläsis_Mühle/01.jpg",
      "Calendar/Anhänge/Bilder/Wandern_Bläsis_Mühle/02.jpg",
    ];
    const newPaths = oldPaths.map((p, i) => buildDailyNotePhotoVaultPath(date, i, titel, p));
    let disk = [
      "## Wandern",
      `> [!mountain]+ ${titel}`,
      `> > ![[${oldPaths[0]}]] ![[${oldPaths[1]}]]`,
      `<!-- udn-wandern: {"titel":"${titel}","fotos":["![[${oldPaths[0]}]]","![[${oldPaths[1]}]]"]} -->`,
    ].join("\n");

    const app = {
      vault: {
        read: async () => disk,
        modify: async (_file: TFile, content: string) => {
          disk = content;
        },
        getAbstractFileByPath(path: string) {
          if (oldPaths.includes(path)) return { extension: "jpg" };
          return null;
        },
        createFolder: async () => {},
        rename: async () => {},
      },
    } as unknown as App;

    const result = await migrateDailyNotePhotoFile(app, { path: "Calendar/Notes/2026-06-14.md" } as TFile);
    expect(result.moved).toBe(2);
    expect(disk).toContain(newPaths[0]!);
    expect(disk).toContain(newPaths[1]!);
    expect(disk).not.toContain(oldPaths[0]);
  });
});
