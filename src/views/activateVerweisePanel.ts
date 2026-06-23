import type { App } from "obsidian";
import { activateSideView } from "./activateSideView";
import { VIEW_TYPE_VERWEISE } from "./viewTypes";

/** Opens or reveals the Tagebuch-Verweise panel in the right sidebar. */
export async function activateVerweisePanel(app: App): Promise<void> {
  await activateSideView(app, VIEW_TYPE_VERWEISE);
}
