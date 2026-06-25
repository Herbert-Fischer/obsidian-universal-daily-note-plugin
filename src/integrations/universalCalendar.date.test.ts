import { describe, expect, it } from "vitest";
import { TFile } from "obsidian";
import { dateFromDailyNoteFile } from "./universalCalendar";

describe("dateFromDailyNoteFile", () => {
  const fallback = {
    folder: "Daily",
    filenameFormat: "YYYY-MM-DD.md",
    templatePath: null,
  };

  it("parses dated note in configured folder", () => {
    const file = new TFile();
    file.path = "Calendar/Notes/2026-06-15.md";
    file.name = "2026-06-15.md";
    const date = dateFromDailyNoteFile(file, fallback, { dailyNotesFolder: "Calendar/Notes", dailyNotesFileClass: "Daily Notes", showTimeBubbles: false });
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(5);
    expect(date?.getDate()).toBe(15);
  });

  it("ignores files outside daily notes folder", () => {
    const file = new TFile();
    file.path = "Projects/2026-06-15.md";
    file.name = "2026-06-15.md";
    expect(dateFromDailyNoteFile(file, fallback, { dailyNotesFolder: "Calendar/Notes", dailyNotesFileClass: "Daily Notes", showTimeBubbles: false })).toBeNull();
  });
});
