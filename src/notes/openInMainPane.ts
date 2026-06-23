import { TFile, type App } from "obsidian";

/** Open a vault file in the main workspace (new tab), not the sidebar. */
export async function openFileInMainPane(app: App, file: TFile, line?: number): Promise<void> {
  const leaf = app.workspace.getLeaf(true);
  await leaf.openFile(file, { active: true });
  app.workspace.setActiveLeaf(leaf, { focus: true });
  if (line != null && line > 0) {
    leaf.setEphemeralState({ line });
  }
}

export async function openPathInMainPane(app: App, filePath: string, line?: number): Promise<void> {
  const file = app.vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) return;
  await openFileInMainPane(app, file, line);
}

/** Open a wikilink target in the main workspace. */
export async function openWikiLinkInMain(app: App, dest: string, sourcePath: string): Promise<void> {
  await app.workspace.openLinkText(dest, sourcePath, true, { active: true });
}
