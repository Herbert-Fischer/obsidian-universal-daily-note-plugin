import { MarkdownView, TFile, type App } from "obsidian";

/** Markdown file in the main editor area (not sidebar). */
export function getMainAreaActiveMarkdownFile(app: App): TFile | null {
  const leaf = app.workspace.getMostRecentLeaf(app.workspace.rootSplit);
  const view = leaf?.view;
  if (view instanceof MarkdownView && view.file instanceof TFile) {
    return view.file;
  }
  return null;
}

export function formatTargetPageLabel(file: TFile): string {
  return file.basename.replace(/\.md$/i, "") || file.path;
}
