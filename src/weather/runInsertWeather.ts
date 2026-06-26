import { Notice } from "obsidian";
import type UniversalDailyNotePlugin from "../main";
import { insertWeatherIntoDailyNote } from "./insertWeather";

export async function runInsertWeather(
  plugin: UniversalDailyNotePlugin,
  date: Date,
  journalHeading?: string,
): Promise<boolean> {
  try {
    await insertWeatherIntoDailyNote(plugin.app, {
      date,
      fallback: plugin.settings.dailyNoteFallback,
      journalHeading: journalHeading?.trim() || plugin.settings.outline.journalHeading,
      settings: plugin.settings.weatherCapture,
      timeFormat: plugin.settings.quickCapture.timeFormat,
    });
    await plugin.saveSettings();
    new Notice("Wetter & Ort eingefügt.");
    return true;
  } catch (e) {
    console.error("Universal Daily Note: Wetter", e);
    const msg = e instanceof Error ? e.message : "Wetter konnte nicht eingefügt werden.";
    if (msg !== "Abgebrochen.") new Notice(msg);
    return false;
  }
}
