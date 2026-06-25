import type { App } from "obsidian";

export const UT_PLUGIN_ID = "universal-tasks";

export const TASK_COMPOSER_ICON = "list-checks";
export const TASK_COMPOSER_LABEL = "Neue Aufgabe";

type TasksPluginLike = {
  openTaskComposerForDate?: (date: Date, options?: { onSaved?: () => void }) => void;
};

/** Open Universal Tasks Aufgaben-Composer for a calendar/outline day. */
export function openUniversalTaskComposer(
  app: App,
  date: Date,
  onSaved?: () => void,
): boolean {
  const plug = app.plugins.plugins[UT_PLUGIN_ID] as TasksPluginLike | undefined;
  if (!plug?.openTaskComposerForDate) return false;
  plug.openTaskComposerForDate(date, { onSaved });
  return true;
}
