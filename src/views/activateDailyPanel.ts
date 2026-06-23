import type { App } from "obsidian";
import { activateSideView } from "./activateSideView";
import { VIEW_TYPE_DAILY_PANEL } from "./viewTypes";

/** Opens or reveals the Tagebuch-Outline panel in the right sidebar. */
export async function activateDailyPanel(app: App): Promise<void> {
  await activateSideView(app, VIEW_TYPE_DAILY_PANEL);
}
