import type { App, TFile } from "obsidian";

export type OutlineHeading = {
  text: string;
  level: number;
  line: number;
};

export function getNoteHeadings(app: App, file: TFile): OutlineHeading[] {
  const cache = app.metadataCache.getFileCache(file);
  const headings = cache?.headings ?? [];
  return headings.map((h) => ({
    text: h.heading,
    level: h.level,
    line: h.position?.start?.line ?? 0,
  }));
}

export async function openNoteAtHeadingLine(app: App, file: TFile, line: number): Promise<void> {
  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(file);
  leaf.setEphemeralState({ line });
}
