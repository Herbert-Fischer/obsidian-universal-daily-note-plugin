import { parseFrontMatterAliases, TFile, type App } from "obsidian";
import { parseCalendarSyncId, stripCalendarSyncMarker, withCalendarSyncMarker } from "../integrations/calendarSyncMarker";
import { appendEntryMeta, parseEntryMetaComment, stripEntryMeta } from "./journalEntryMeta";
import { formatJournalEntryText, parseJournalEntryDisplay } from "./parseJournalEntryDisplay";

const WIKI_LINK_RE = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;

export type VaultLinkIndex = {
  byBasename: Map<string, TFile[]>;
  byAlias: Map<string, TFile[]>;
};

let cachedVaultLinkIndex: { app: App; index: VaultLinkIndex } | null = null;

export function invalidateVaultLinkIndexCache(): void {
  cachedVaultLinkIndex = null;
}

export function getVaultLinkIndex(app: App): VaultLinkIndex {
  if (cachedVaultLinkIndex?.app === app) return cachedVaultLinkIndex.index;
  const index = buildVaultLinkIndex(app);
  cachedVaultLinkIndex = { app, index };
  return index;
}

export function buildVaultLinkIndex(app: App): VaultLinkIndex {
  const byBasename = new Map<string, TFile[]>();
  const byAlias = new Map<string, TFile[]>();

  for (const file of app.vault.getMarkdownFiles()) {
    const baseKey = file.basename.toLowerCase();
    const baseList = byBasename.get(baseKey) ?? [];
    baseList.push(file);
    byBasename.set(baseKey, baseList);

    const aliases = parseFrontMatterAliases(app.metadataCache.getFileCache(file)?.frontmatter ?? null) ?? [];
    for (const alias of aliases) {
      const aliasKey = alias.trim().toLowerCase();
      if (!aliasKey) continue;
      const aliasList = byAlias.get(aliasKey) ?? [];
      aliasList.push(file);
      byAlias.set(aliasKey, aliasList);
    }
  }

  return { byBasename, byAlias };
}

export function fileLinkPriority(path: string): number {
  const norm = path.replace(/\\/g, "/");
  if (norm.startsWith("+/")) return 0;
  if (norm.includes("/Atlas/") || norm.startsWith("Atlas/")) return 10;
  return 5;
}

export function isLikelyStubPath(path: string): boolean {
  const norm = path.replace(/\\/g, "/");
  return norm.startsWith("+/");
}

function aliasMatchesQuery(alias: string, pageKey: string): boolean {
  const a = alias.trim().toLowerCase();
  if (!a || !pageKey) return false;
  return a === pageKey || a.startsWith(`${pageKey} `) || a.startsWith(`${pageKey}(`);
}

function basenameMatchesQuery(basename: string, pageKey: string): boolean {
  const b = basename.trim().toLowerCase();
  if (!b || !pageKey) return false;
  return b === pageKey || b.endsWith(` ${pageKey}`);
}

function collectCandidates(app: App, page: string, sourcePath: string, index: VaultLinkIndex): TFile[] {
  const pageKey = page.trim().toLowerCase();
  if (!pageKey) return [];

  const candidates: TFile[] = [];
  const direct = app.metadataCache.getFirstLinkpathDest(page.trim(), sourcePath);
  if (direct instanceof TFile) candidates.push(direct);

  for (const file of index.byAlias.get(pageKey) ?? []) candidates.push(file);
  for (const file of index.byBasename.get(pageKey) ?? []) candidates.push(file);

  for (const file of app.vault.getMarkdownFiles()) {
    const aliases = parseFrontMatterAliases(app.metadataCache.getFileCache(file)?.frontmatter ?? null) ?? [];
    if (aliases.some((alias) => aliasMatchesQuery(alias, pageKey))) candidates.push(file);
    if (basenameMatchesQuery(file.basename, pageKey)) candidates.push(file);
  }

  return [...new Map(candidates.map((f) => [f.path, f])).values()];
}

function sortCandidatesByPriority(candidates: TFile[]): TFile[] {
  return [...candidates].sort((a, b) => {
    const score = fileLinkPriority(b.path) - fileLinkPriority(a.path);
    if (score !== 0) return score;
    return a.path.length - b.path.length;
  });
}

function pickBestCandidate(candidates: TFile[], pageKey = ""): TFile | null {
  if (candidates.length === 0) return null;
  const key = pageKey.trim().toLowerCase();
  const sorted = sortCandidatesByPriority(candidates);
  const nonStub = sorted.filter((f) => !isLikelyStubPath(f.path));

  if (key) {
    const exactBasename = candidates.filter((f) => f.basename.toLowerCase() === key);
    const nonStubExact = sortCandidatesByPriority(exactBasename.filter((f) => !isLikelyStubPath(f.path)));
    if (nonStubExact[0]) return nonStubExact[0];
    if (nonStub[0]) return nonStub[0];
    const stubExact = sortCandidatesByPriority(exactBasename);
    if (stubExact[0]) return stubExact[0];
  }

  return nonStub[0] ?? sorted[0] ?? null;
}

/** Prefer unique basename (Obsidian: `[[Mona Buchmann|Mona]]`); else vault path without `.md`. */
export function canonicalLinkPath(file: TFile, index: VaultLinkIndex): string {
  const key = file.basename.toLowerCase();
  const sameBase = index.byBasename.get(key) ?? [];
  if (sameBase.length === 1) return file.basename;
  return file.path.replace(/\.md$/i, "");
}

export function resolveWikiLinkMarkdown(
  app: App,
  page: string,
  heading: string | undefined,
  explicitAlias: string | undefined,
  sourcePath: string,
  index: VaultLinkIndex,
): string {
  const pageTrim = page.trim();
  const label = explicitAlias?.trim() || pageTrim;
  const candidates = collectCandidates(app, pageTrim, sourcePath, index);
  const best = pickBestCandidate(candidates, pageTrim);

  if (!best) {
    if (heading?.trim()) {
      return explicitAlias?.trim()
        ? `[[${pageTrim}#${heading.trim()}|${label}]]`
        : `[[${pageTrim}#${heading.trim()}]]`;
    }
    return explicitAlias?.trim() ? `[[${pageTrim}|${label}]]` : `[[${page}]]`;
  }

  if (!explicitAlias?.trim()) {
    const direct = app.metadataCache.getFirstLinkpathDest(pageTrim, sourcePath);
    if (direct instanceof TFile && direct.path === best.path) {
      if (heading?.trim()) return `[[${pageTrim}#${heading.trim()}]]`;
      return `[[${pageTrim}]]`;
    }
  }

  const linkPath = canonicalLinkPath(best, index);
  const needsAlias = label.toLowerCase() !== linkPath.toLowerCase();

  if (heading?.trim()) {
    return needsAlias
      ? `[[${linkPath}#${heading.trim()}|${label}]]`
      : `[[${linkPath}#${heading.trim()}]]`;
  }
  return needsAlias ? `[[${linkPath}|${label}]]` : `[[${linkPath}]]`;
}

export function resolveWikiLinksInText(
  app: App,
  text: string,
  sourcePath = "",
  index?: VaultLinkIndex,
): string {
  if (!text.trim()) return text;
  const vaultIndex = index ?? buildVaultLinkIndex(app);
  return text.replace(WIKI_LINK_RE, (_full, page: string, heading: string | undefined, alias: string | undefined) => {
    const pageTrim = page.trim();
    if (!pageTrim) return _full;
    return resolveWikiLinkMarkdown(app, pageTrim, heading, alias, sourcePath, vaultIndex);
  });
}

/** Split trailing `[[…]]` groups from the end (already formatted termin lines). */
export function splitTrailingWikiLinkBlock(text: string): { leading: string; trailing: string[] } {
  let leading = text.trim();
  const trailing: string[] = [];
  const linkAtEnd = /\s*(\[\[[^\]]+\]\])\s*$/;
  while (linkAtEnd.test(leading)) {
    const match = leading.match(linkAtEnd);
    if (!match?.[1]) break;
    trailing.unshift(match[1]);
    leading = leading.slice(0, leading.length - match[0].length).trimEnd();
  }
  return { leading: leading.trim(), trailing };
}

function collectCanonicalLink(
  app: App,
  page: string,
  heading: string | undefined,
  alias: string | undefined,
  sourcePath: string,
  index: VaultLinkIndex,
  linksInOrder: string[],
  seen: Set<string>,
): string {
  const label = alias?.trim() || page.trim();
  const canonical = resolveWikiLinkMarkdown(app, page.trim(), heading, alias, sourcePath, index);
  const key = canonical.toLowerCase();
  if (!seen.has(key)) {
    seen.add(key);
    linksInOrder.push(canonical);
  }
  return label;
}

function parseWikiLinkToken(token: string): { page: string; heading?: string; alias?: string } {
  const inner = token.slice(2, -2);
  const hashIdx = inner.indexOf("#");
  const pipeIdx = inner.indexOf("|");
  let page = inner;
  let heading: string | undefined;
  let alias: string | undefined;
  if (pipeIdx >= 0) {
    page = inner.slice(0, pipeIdx);
    alias = inner.slice(pipeIdx + 1);
  }
  if (hashIdx >= 0) {
    const pagePart = page.slice(0, hashIdx);
    heading = page.slice(hashIdx + 1);
    page = pagePart;
  }
  return { page: page.trim(), heading: heading?.trim(), alias: alias?.trim() };
}

const TRAILING_SEPARATOR_RE = /\s{2,}(?:\[\[[^\]]+\]\]\s*)+$/;

function hasFormattedTrailingLinks(text: string): boolean {
  return TRAILING_SEPARATOR_RE.test(text.trim());
}

function stripRepeatedTrailingAliases(leading: string, trailing: string[]): string {
  let prose = leading.replace(/\s+/g, " ").trim();
  for (const token of trailing) {
    const alias = parseWikiLinkToken(token).alias?.trim();
    if (!alias) continue;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const repeat = new RegExp(`(?:\\s+${escaped}){2,}$`, "i");
    prose = prose.replace(repeat, "").trimEnd();
  }
  return prose;
}

/**
 * CalDAV / Termin: `[[Mona]]` → prose „Mona“, Links am Ende: `[[Mona Buchmann|Mona]]`.
 * Example: `Lindengut mit Mona & Hermann   [[Biohotel Lindengut|Lindengut]] [[Mona Buchmann|Mona]] …`
 */
export function formatTerminProseWithTrailingLinks(
  app: App,
  text: string,
  sourcePath = "",
  index?: VaultLinkIndex,
): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const vaultIndex = index ?? buildVaultLinkIndex(app);
  if (hasFormattedTrailingLinks(trimmed)) {
    const split = splitTrailingWikiLinkBlock(trimmed);
    const linksInOrder: string[] = [];
    const seen = new Set<string>();
    for (const token of split.trailing) {
      const { page, heading, alias } = parseWikiLinkToken(token);
      collectCanonicalLink(app, page, heading, alias, sourcePath, vaultIndex, linksInOrder, seen);
    }
    const prose = stripRepeatedTrailingAliases(split.leading, split.trailing);
    if (linksInOrder.length === 0) return prose;
    return `${prose}   ${linksInOrder.join(" ")}`;
  }

  const linksInOrder: string[] = [];
  const seen = new Set<string>();

  if (!trimmed.includes("[[")) return trimmed;

  let prose = "";
  let lastIndex = 0;
  const re = new RegExp(WIKI_LINK_RE.source, WIKI_LINK_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(trimmed)) !== null) {
    const [full, page, heading, alias] = match;
    prose += trimmed.slice(lastIndex, match.index);
    const label = collectCanonicalLink(
      app,
      page,
      heading,
      alias,
      sourcePath,
      vaultIndex,
      linksInOrder,
      seen,
    );
    const before = prose.trimEnd();
    if (!before.toLowerCase().endsWith(label.toLowerCase())) {
      prose += label;
    }
    lastIndex = match.index + full.length;
  }
  prose += trimmed.slice(lastIndex);
  prose = prose.replace(/\s+/g, " ").trim();

  if (linksInOrder.length === 0) return prose;
  return `${prose}   ${linksInOrder.join(" ")}`;
}

export function isUnresolvedWikiLink(app: App, dest: string, sourcePath = ""): boolean {
  const hashIdx = dest.indexOf("#");
  const page = (hashIdx >= 0 ? dest.slice(0, hashIdx) : dest).trim();
  if (!page) return true;
  return !(app.metadataCache.getFirstLinkpathDest(page, sourcePath) instanceof TFile);
}

const TERM_PREFIX = /^termin:\s*/i;

/** Resolve Termin lines: plain names in text, canonical `[[Ziel|Alias]]` links at the end. */
export function resolveJournalBodyWikiLinks(
  app: App,
  body: string,
  sourcePath = "",
  index?: VaultLinkIndex,
): string {
  const trimmed = body.trim();
  if (!trimmed.includes("[[")) return body;
  const vaultIndex = index ?? buildVaultLinkIndex(app);

  if (TERM_PREFIX.test(trimmed)) {
    const rest = trimmed.replace(TERM_PREFIX, "");
    const resolved = formatTerminProseWithTrailingLinks(app, rest, sourcePath, vaultIndex);
    return resolved === rest ? body : `Termin: ${resolved}`;
  }

  const resolved = resolveWikiLinksInText(app, trimmed, sourcePath, vaultIndex);
  return resolved === trimmed ? body : resolved;
}

/** Upgrade wiki links in stored journal entry lines (incl. existing calendar rows). */
export function upgradeJournalEntryTextsLinks(app: App, entryTexts: string[], sourcePath = ""): string[] {
  const index = getVaultLinkIndex(app);
  return entryTexts.map((text) => {
    const entryMeta = parseEntryMetaComment(text);
    const { time, body } = parseJournalEntryDisplay(text);
    const strippedBody = stripEntryMeta(stripCalendarSyncMarker(body)).body;
    const resolvedBody = resolveJournalBodyWikiLinks(app, strippedBody, sourcePath, index);
    if (resolvedBody === strippedBody) return text;
    const calId = parseCalendarSyncId(text);
    const nextBody = calId ? withCalendarSyncMarker(resolvedBody, calId) : resolvedBody;
    const line = formatJournalEntryText(time, nextBody);
    return entryMeta ? appendEntryMeta(line, entryMeta) : line;
  });
}
