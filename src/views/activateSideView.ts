import type { App, Workspace } from "obsidian";

/** Opens or reveals a view in the bottom split of the right sidebar. */
export async function activateSideView(app: App, viewType: string): Promise<void> {
  const { workspace } = app;

  const existing = workspace.getLeavesOfType(viewType)[0];
  if (existing) {
    workspace.revealLeaf(existing);
    return;
  }

  if (hasEnsureSideLeaf(workspace)) {
    await workspace.ensureSideLeaf(viewType, "right", {
      active: true,
      reveal: true,
      split: true,
    });
    return;
  }

  const leaf = workspace.getRightLeaf(true) ?? workspace.getRightLeaf(false);
  if (!leaf) return;

  await leaf.setViewState({ type: viewType, active: true });
  workspace.revealLeaf(leaf);
}

function hasEnsureSideLeaf(
  workspace: Workspace,
): workspace is Workspace & {
  ensureSideLeaf: (
    type: string,
    side: "left" | "right",
    options?: { active?: boolean; reveal?: boolean; split?: boolean },
  ) => Promise<unknown>;
} {
  return typeof (workspace as { ensureSideLeaf?: unknown }).ensureSideLeaf === "function";
}
