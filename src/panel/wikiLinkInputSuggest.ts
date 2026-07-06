import {
  AbstractInputSuggest,
  parseFrontMatterAliases,
  TFile,
  type App,
} from "obsidian";
import { replaceWikiPartial, resolveWikiLinkCursor, wikiQueryBeforeCursor } from "./wikiLinkInputParse";
import {
  matchWikiLinkSuggestions,
  type WikiLinkFileInfo,
  type WikiLinkSuggestion,
} from "./wikiLinkSuggestions";

export { replaceWikiPartial, resolveWikiLinkCursor, wikiQueryBeforeCursor } from "./wikiLinkInputParse";
export { matchWikiLinkSuggestions, parseWikiPartialQuery } from "./wikiLinkSuggestions";
export type { WikiLinkSuggestion } from "./wikiLinkSuggestions";

type WikiLinkFieldEl = HTMLInputElement | HTMLTextAreaElement;

type WikiLinkSuggestParams = {
  app: App;
  sourcePath?: string;
  onValueChange?: (value: string, cursor: number) => void;
};

type WikiFileInfoCache = {
  files: WikiLinkFileInfo[];
};

const wikiFileInfoCache = new WeakMap<App, WikiFileInfoCache>();
const wikiFileInfoListeners = new WeakSet<App>();

function invalidateWikiFileInfoCache(app: App): void {
  wikiFileInfoCache.delete(app);
}

function ensureWikiFileInfoCache(app: App): WikiLinkFileInfo[] {
  const cached = wikiFileInfoCache.get(app);
  if (cached) return cached.files;

  const files = app.vault.getMarkdownFiles().map((file) => {
    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter ?? null;
    return {
      path: file.path,
      basename: file.basename,
      aliases: parseFrontMatterAliases(frontmatter) ?? [],
    };
  });
  wikiFileInfoCache.set(app, { files });

  if (!wikiFileInfoListeners.has(app)) {
    wikiFileInfoListeners.add(app);
    app.vault.on("create", () => invalidateWikiFileInfoCache(app));
    app.vault.on("delete", () => invalidateWikiFileInfoCache(app));
    app.vault.on("rename", () => invalidateWikiFileInfoCache(app));
    app.metadataCache.on("changed", () => invalidateWikiFileInfoCache(app));
  }

  return files;
}

export function isWikiLinkSuggestOpen(): boolean {
  return Boolean(document.querySelector(".suggestion-container"));
}

export class WikiLinkInputSuggest extends AbstractInputSuggest<WikiLinkSuggestion> {
  private sourcePath: string;
  private onValueChange?: (value: string, cursor: number) => void;

  constructor(
    app: App,
    private inputEl: WikiLinkFieldEl,
    sourcePath = "",
    onValueChange?: (value: string, cursor: number) => void,
  ) {
    super(app, inputEl);
    this.limit = 50;
    this.sourcePath = sourcePath;
    this.onValueChange = onValueChange;
  }

  setSourcePath(sourcePath: string): void {
    this.sourcePath = sourcePath;
  }

  setOnValueChange(onValueChange?: (value: string, cursor: number) => void): void {
    this.onValueChange = onValueChange;
  }

  private listFileInfos(): WikiLinkFileInfo[] {
    return ensureWikiFileInfoCache(this.app);
  }

  getSuggestions(query: string): WikiLinkSuggestion[] {
    const cursor = resolveWikiLinkCursor(query, this.inputEl.selectionStart ?? query.length);
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
    const subpath = item.heading?.trim() ? `#${item.heading.trim()}` : undefined;
    const label = item.alias ?? item.basename;
    let insertion: string;
    if (file instanceof TFile) {
      const dest = this.app.metadataCache.getFirstLinkpathDest(label, this.sourcePath);
      if (dest instanceof TFile && dest.path === file.path) {
        insertion = subpath ? `[[${label}${subpath}]]` : `[[${label}]]`;
      } else {
        insertion = this.app.fileManager.generateMarkdownLink(file, this.sourcePath, subpath, item.alias);
      }
    } else {
      insertion = item.alias ? `[[${item.basename}|${item.alias}]]` : `[[${item.basename}]]`;
    }

    const value = this.getValue();
    const cursor = resolveWikiLinkCursor(value, this.inputEl.selectionStart ?? value.length);
    const { next, cursor: nextCursor } = replaceWikiPartial(value, cursor, insertion);

    if (this.onValueChange) {
      this.onValueChange(next, nextCursor);
    }
    this.setValue(next);
    this.inputEl.setSelectionRange(nextCursor, nextCursor);
    this.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    void this.inputEl.focus();
    this.close();
  }
}

export function attachWikiLinkSuggest(
  app: App,
  inputEl: WikiLinkFieldEl,
  sourcePath = "",
  onValueChange?: (value: string, cursor: number) => void,
): () => void {
  const suggest = new WikiLinkInputSuggest(app, inputEl, sourcePath, onValueChange);
  return () => suggest.close();
}

/** Svelte action: Obsidian-style `[[` file suggest with alias support. */
export function wikiLinkSuggest(
  node: WikiLinkFieldEl,
  params: App | WikiLinkSuggestParams,
): { update?: (params: App | WikiLinkSuggestParams) => void; destroy: () => void } {
  const resolve = (params: App | WikiLinkSuggestParams): WikiLinkSuggestParams =>
    typeof params === "object" && params !== null && "app" in params
      ? params
      : { app: params as App };

  let current = resolve(params);
  let suggest = new WikiLinkInputSuggest(
    current.app,
    node,
    current.sourcePath ?? "",
    current.onValueChange,
  );

  return {
    update(nextParams) {
      current = resolve(nextParams);
      suggest.setSourcePath(current.sourcePath ?? "");
      suggest.setOnValueChange(current.onValueChange);
    },
    destroy() {
      suggest.close();
    },
  };
}
