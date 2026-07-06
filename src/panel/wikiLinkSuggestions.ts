export type WikiLinkSuggestion = {
  filePath: string;
  basename: string;
  alias?: string;
  label: string;
  detail?: string;
  heading?: string;
};

export type WikiLinkFileInfo = {
  path: string;
  basename: string;
  aliases: string[];
};

export type WikiPartialQuery = {
  page: string;
  heading?: string;
  aliasPart?: string;
  search: string;
  aliasMode: boolean;
};

/** Parse the unfinished wikilink fragment after `[[`. */
export function parseWikiPartialQuery(linkQuery: string): WikiPartialQuery {
  let rest = linkQuery;
  let heading: string | undefined;
  const hashIdx = rest.indexOf("#");
  if (hashIdx >= 0) {
    heading = rest.slice(hashIdx + 1);
    rest = rest.slice(0, hashIdx);
  }

  const pipeIdx = rest.indexOf("|");
  if (pipeIdx >= 0) {
    const page = rest.slice(0, pipeIdx).trim();
    const aliasPart = rest.slice(pipeIdx + 1);
    return {
      page,
      heading,
      aliasPart,
      search: aliasPart.trim() || page,
      aliasMode: true,
    };
  }

  return {
    page: rest.trim(),
    heading,
    search: rest.trim(),
    aliasMode: false,
  };
}

function fileMatchesPage(file: WikiLinkFileInfo, page: string): boolean {
  const target = page.trim().toLowerCase();
  if (!target) return true;
  const base = file.basename.toLowerCase();
  const path = file.path.toLowerCase();
  return (
    base === target ||
    base.includes(target) ||
    path.includes(target) ||
    path.endsWith(`/${target}.md`)
  );
}

export function matchWikiLinkSuggestions(
  files: WikiLinkFileInfo[],
  linkQuery: string,
  limit = 50,
): WikiLinkSuggestion[] {
  const parsed = parseWikiPartialQuery(linkQuery);
  const searchQ = parsed.search.trim().toLowerCase();

  const results: WikiLinkSuggestion[] = [];
  const seen = new Set<string>();
  const hasExactBasename = files.some((file) => file.basename.toLowerCase() === searchQ);

  const push = (item: WikiLinkSuggestion) => {
    const key = `${item.filePath}::${item.alias ?? ""}::${item.heading ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(item);
  };

  if (!searchQ && !(parsed.aliasMode && parsed.page)) {
    for (const file of files) {
      push({
        filePath: file.path,
        basename: file.basename,
        label: file.basename,
        detail: file.path === `${file.basename}.md` ? undefined : file.path,
        heading: parsed.heading,
      });
      if (results.length >= limit) break;
    }
    results.sort((a, b) => a.label.localeCompare(b.label, "de"));
    return results.slice(0, Math.max(1, limit));
  }

  for (const file of files) {
    if (parsed.aliasMode && parsed.page && !fileMatchesPage(file, parsed.page)) continue;

    if (!parsed.aliasMode) {
      const base = file.basename.toLowerCase();
      const matches =
        base === searchQ ||
        base.startsWith(searchQ) ||
        (!hasExactBasename && base.includes(searchQ));
      if (matches) {
        push({
          filePath: file.path,
          basename: file.basename,
          label: file.basename,
          detail: file.path === `${file.basename}.md` ? undefined : file.path,
          heading: parsed.heading,
        });
      }
    }

    for (const alias of file.aliases) {
      const aliasTrim = alias.trim();
      if (!aliasTrim) continue;
      if (parsed.aliasMode && parsed.aliasPart !== undefined && parsed.aliasPart.trim() === "") {
        push({
          filePath: file.path,
          basename: file.basename,
          alias: aliasTrim,
          label: aliasTrim,
          detail: file.basename,
          heading: parsed.heading,
        });
        continue;
      }
      if (aliasTrim.toLowerCase().includes(searchQ)) {
        push({
          filePath: file.path,
          basename: file.basename,
          alias: aliasTrim,
          label: aliasTrim,
          detail: file.basename,
          heading: parsed.heading,
        });
      }
    }
  }

  results.sort((a, b) => {
    const rank = (item: WikiLinkSuggestion) => {
      const label = item.label.toLowerCase();
      const base = item.basename.toLowerCase();
      if (label === searchQ || base === searchQ) return 0;
      if (label.startsWith(searchQ) || base.startsWith(searchQ)) return 1;
      return 2;
    };
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    if (a.alias && !b.alias) return -1;
    if (!a.alias && b.alias) return 1;
    return a.label.localeCompare(b.label, "de");
  });

  return results.slice(0, Math.max(1, limit));
}
