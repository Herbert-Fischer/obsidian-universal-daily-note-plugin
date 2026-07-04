/** Vitest stub — Obsidian API is only available inside the app. */
export async function requestUrl(): Promise<never> {
  throw new Error("requestUrl is not available in unit tests");
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\//, "");
}

export function parseFrontMatterStringArray(
  frontmatter: Record<string, unknown> | null,
  key: string | RegExp,
): string[] | null {
  if (!frontmatter) return null;
  const k = typeof key === "string" ? key : key.source;
  const raw = frontmatter[k] ?? frontmatter[k.toLowerCase()];
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    return raw.map((x) => (typeof x === "string" ? x : String(x)));
  }
  if (typeof raw === "string") return [raw];
  return null;
}

export function parseFrontMatterAliases(frontmatter: Record<string, unknown> | null | undefined): string[] | null {
  return (
    parseFrontMatterStringArray(frontmatter ?? null, "aliases") ??
    parseFrontMatterStringArray(frontmatter ?? null, "alias")
  );
}

export class TFile {
  extension = "md";
  constructor(
    public path: string,
    public basename: string,
  ) {}
}

const stubFiles: TFile[] = [];

export function __stubSetMarkdownFiles(files: { path: string; basename: string }[]): void {
  stubFiles.length = 0;
  for (const f of files) {
    stubFiles.push(new TFile(f.path, f.basename));
  }
}

export class Vault {
  getAbstractFileByPath(path: string): TFile | null {
    const n = normalizePath(path);
    return stubFiles.find((f) => normalizePath(f.path) === n) ?? null;
  }
  getMarkdownFiles(): TFile[] {
    return [...stubFiles];
  }
}

export class MetadataCache {
  getFirstLinkpathDest(_linkpath: string, _sourcePath: string): TFile | null {
    return null;
  }
}

export class App {
  vault = new Vault();
  metadataCache = new MetadataCache();
}

export function moment(input?: number[]): { year(): number; month(): number; date(): number } {
  const d = input ? new Date(input[0]!, input[1]!, input[2]!) : new Date();
  return {
    year: () => d.getFullYear(),
    month: () => d.getMonth(),
    date: () => d.getDate(),
  };
}
