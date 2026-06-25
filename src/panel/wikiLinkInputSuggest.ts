import {
  AbstractInputSuggest,
  parseFrontMatterAliases,
  type App,
  type TFile,
} from "obsidian";
import { replaceWikiPartial, wikiQueryBeforeCursor } from "./wikiLinkInputParse";
import {
  matchWikiLinkSuggestions,
  type WikiLinkFileInfo,
  type WikiLinkSuggestion,
} from "./wikiLinkSuggestions";

export { replaceWikiPartial, wikiQueryBeforeCursor } from "./wikiLinkInputParse";
export { matchWikiLinkSuggestions, parseWikiPartialQuery } from "./wikiLinkSuggestions";
export type { WikiLinkSuggestion } from "./wikiLinkSuggestions";

type WikiLinkSuggestParams = {
  app: App;
  sourcePath?: string;
};

export class WikiLinkInputSuggest extends AbstractInputSuggest<WikiLinkSuggestion> {
  private sourcePath: string;

  constructor(app: App, private inputEl: HTMLInputElement, sourcePath = "") {
    super(app, inputEl);
    this.limit = 50;
    this.sourcePath = sourcePath;
  }

  setSourcePath(sourcePath: string): void {
    this.sourcePath = sourcePath;
  }

  private listFileInfos(): WikiLinkFileInfo[] {
    return this.app.vault.getMarkdownFiles().map((file) => {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter ?? null;
      return {
        path: file.path,
        basename: file.basename,
        aliases: parseFrontMatterAliases(frontmatter) ?? [],
      };
    });
  }

  getSuggestions(query: string): WikiLinkSuggestion[] {
    const cursor = this.inputEl.selectionStart ?? query.length;
    const linkQuery = wikiQueryBeforeCursor(query, cursor);
    if (linkQuery === null) return [];
    return matchWikiLinkSuggestions(this.listFileInfos(), linkQuery, this.limit || 50);
  }

  renderSuggestion(item: WikiLinkSuggestion, el: HTMLElement): void {
    el.setText(item.label);
    if (item.detail) {
      el.createEl("div", { cls: "suggestion-note", text: item.detail });
    }
  }

  selectSuggestion(item: WikiLinkSuggestion, _evt: MouseEvent | KeyboardEvent): void {
    const file = this.app.vault.getAbstractFileByPath(item.filePath);
    if (!(file instanceof TFile)) return;

    const value = this.getValue();
    const cursor = this.inputEl.selectionStart ?? value.length;
    const subpath = item.heading?.trim() ? `#${item.heading.trim()}` : undefined;
    const insertion = this.app.fileManager.generateMarkdownLink(
      file,
      this.sourcePath,
      subpath,
      item.alias,
    );
    const { next, cursor: nextCursor } = replaceWikiPartial(value, cursor, insertion);
    this.setValue(next);
    this.inputEl.setSelectionRange(nextCursor, nextCursor);
    this.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    this.close();
  }
}

export function attachWikiLinkSuggest(
  app: App,
  inputEl: HTMLInputElement,
  sourcePath = "",
): () => void {
  const suggest = new WikiLinkInputSuggest(app, inputEl, sourcePath);
  return () => suggest.close();
}

/** Svelte action: Obsidian-style `[[` file suggest with alias support. */
export function wikiLinkSuggest(
  node: HTMLInputElement,
  params: App | WikiLinkSuggestParams,
): { update?: (params: App | WikiLinkSuggestParams) => void; destroy: () => void } {
  const resolve = (params: App | WikiLinkSuggestParams): WikiLinkSuggestParams =>
    typeof params === "object" && params !== null && "app" in params
      ? params
      : { app: params as App };

  let current = resolve(params);
  let detach = attachWikiLinkSuggest(current.app, node, current.sourcePath ?? "");

  return {
    update(nextParams) {
      detach();
      current = resolve(nextParams);
      detach = attachWikiLinkSuggest(current.app, node, current.sourcePath ?? "");
    },
    destroy() {
      detach();
    },
  };
}
