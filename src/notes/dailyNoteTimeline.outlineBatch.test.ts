import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import type { App, TFile } from "obsidian";
import { loadOutlineBatch } from "./dailyNoteTimeline";
import { DEFAULT_SETTINGS } from "../settings";

const NOTES_DIR = "/vault/Calendar/Notes";

function mockVaultApp(): App {
  const files = new Map<string, { name: string; path: string; content: string }>();
  for (const name of readdirSync(NOTES_DIR)) {
    if (!name.endsWith(".md")) continue;
    const path = `Calendar/Notes/${name}`;
    files.set(path, {
      name,
      path,
      content: readFileSync(join(NOTES_DIR, name), "utf8"),
    });
  }

  const tfiles: TFile[] = [...files.values()].map((f) => ({
    name: f.name,
    path: f.path,
    basename: f.name.replace(/\.md$/i, ""),
    extension: "md",
  })) as TFile[];

  return {
    vault: {
      getMarkdownFiles: () => tfiles,
      read: async (file: TFile) => files.get(file.path)?.content ?? "",
    },
    metadataCache: {
      getFileCache: () => ({ frontmatter: {} }),
    },
    plugins: {
      plugins: {
        "universal-daily-note": {
          settings: {
            ...DEFAULT_SETTINGS,
            dailyNoteFallback: {
              folder: "Daily",
              filenameFormat: "YYYY-MM-DD",
              templatePath: null,
            },
            tagebuchVerweise: {
              dailyNotesFolder: "Calendar/Notes",
              dailyNotesFileClass: "Daily Notes",
              showTimeBubbles: false,
            },
            calendarSync: {
              enabled: false,
              includeTodos: false,
              syncOnOutlineLoad: false,
              includeMarkdownNotes: false,
              allDayTime: "09:00",
            },
          },
        },
      },
    },
  } as unknown as App;
}

describe("loadOutlineBatch reisen filter", () => {
  it("returns days with reisen entries from vault Calendar/Notes", async () => {
    const app = mockVaultApp();
    const anchor = new Date(2026, 6, 3);
    const batch = await loadOutlineBatch(
      app,
      anchor,
      DEFAULT_SETTINGS.dailyNoteFallback,
      { dailyNotesFolder: "Calendar/Notes", dailyNotesFileClass: "Daily Notes", showTimeBubbles: false },
      { durationDays: 365, journalHeading: "Tagebuch", excludedHeadings: [] },
      {
        pageSize: 10,
        feedProfileFilters: ["reisen"],
        includeRestOfTagebuch: false,
      },
    );

    expect(batch.days.length).toBeGreaterThan(0);
    expect(batch.days.some((d) => d.dateKey === "2026-06-10")).toBe(true);
    const june10 = batch.days.find((d) => d.dateKey === "2026-06-10");
    expect(june10?.entries.some((e) => e.feedProfile === "reisen")).toBe(true);
  });
});
