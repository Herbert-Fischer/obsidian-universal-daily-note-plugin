import { ItemView, WorkspaceLeaf } from "obsidian";
import {
  applyDenkariumItemViewScrollLayout,
  clearDenkariumItemViewScrollLayout,
} from "@denkarium/obsidian-lib-vault";
import { dk } from "@denkarium/obsidian-lib-ui";
import type UniversalDailyNotePlugin from "../main";
import { mountVerweisePanel, type VerweisePanelMount } from "../panel/mountVerweisePanel";
import { VIEW_TYPE_VERWEISE } from "./viewTypes";

export class VerweisePanelView extends ItemView {
  private plugin: UniversalDailyNotePlugin;
  private panelMount: VerweisePanelMount | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: UniversalDailyNotePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_VERWEISE;
  }

  getDisplayText(): string {
    return "Tagebuch-Verweise";
  }

  getIcon(): string {
    return "link-2";
  }

  async onOpen(): Promise<void> {
    applyDenkariumItemViewScrollLayout(this);

    const root = this.contentEl.createDiv({ cls: `${dk.root} ${dk.view} udn-view udn-view--verweise` });
    this.panelMount = mountVerweisePanel(root, this.plugin);
  }

  async onClose(): Promise<void> {
    this.panelMount?.destroy();
    this.panelMount = null;
    this.contentEl.empty();
    clearDenkariumItemViewScrollLayout(this);
  }
}
