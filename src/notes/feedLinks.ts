import { TFile, type App } from "obsidian";

const WIKI_LINK_RE = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;

export function pickFileAlias(app: App, file: TFile): string | null {
  const raw = app.metadataCache.getFileCache(file)?.frontmatter?.aliases ?? app.metadataCache.getFileCache(file)?.frontmatter?.alias;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && item.trim()) return item.trim();
    }
  }
  return null;
}

/** Build wikilink markdown; uses vault alias when defined and no explicit alias in dest. */
export function preferredWikiLinkMarkdown(app: App, dest: string, sourcePath = ""): string {
  const hashIdx = dest.indexOf("#");
  const page = (hashIdx >= 0 ? dest.slice(0, hashIdx) : dest).trim();
  const heading = hashIdx >= 0 ? dest.slice(hashIdx + 1).trim() : "";
  if (!page) return "";

  const file = app.metadataCache.getFirstLinkpathDest(page, sourcePath);
  const alias = file instanceof TFile ? pickFileAlias(app, file) : null;
  if (heading) {
    return alias ? `[[${page}#${heading}|${alias}]]` : `[[${page}#${heading}]]`;
  }
  return alias ? `[[${page}|${alias}]]` : `[[${page}]]`;
}

/** Re-resolve links without explicit alias to use vault aliases. */
export function resolveFeedLinksMarkdown(app: App, markdown: string, sourcePath = ""): string {
  if (!markdown.trim()) return "";
  return markdown.replace(WIKI_LINK_RE, (full, page: string, heading: string | undefined, alias: string | undefined) => {
    if (alias?.trim()) return full;
    const dest = heading?.trim() ? `${page.trim()}#${heading.trim()}` : page.trim();
    return preferredWikiLinkMarkdown(app, dest, sourcePath);
  });
}

/** Split feed bullet body into plain text and trailing link suffix. */
export function splitFeedLineContent(text: string): { body: string; linksMarkdown: string } {
  const trimmed = text.trim();
  const linkStart = trimmed.indexOf("([[");
  if (linkStart < 0) {
    return { body: trimmed, linksMarkdown: "" };
  }
  return {
    body: trimmed.slice(0, linkStart).trim(),
    linksMarkdown: trimmed.slice(linkStart).trim(),
  };
}

export function defaultFeedLinksForProfile(app: App, feedSuffix: string, sourcePath = ""): string {
  return resolveFeedLinksMarkdown(app, feedSuffix.trim(), sourcePath);
}
