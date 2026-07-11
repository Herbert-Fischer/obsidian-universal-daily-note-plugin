import type { Plugin } from "obsidian";
import { extractSectionRange } from "../notes/journalCallout";
import { resolveWalkBeschreibung } from "../notes/walkStatsBeschreibung";
import { parseSpaziergangEntryMetaLine } from "../notes/spaziergangComposer";
import { parseWandernEntryMetaLine } from "../notes/wandernComposer";

export type WalkEntryMeta = {
  profile: "wandern" | "spaziergang";
  titel: string;
  kurz: string;
  beschreibung: string;
};

function stripCalloutPrefix(line: string): string {
  return line.replace(/^(?:>\s*)+/, "").trim();
}

function calloutTitleFromLine(line: string): string {
  const trimmed = stripCalloutPrefix(line);
  const m = trimmed.match(/^\[!([^\]|]+)(?:\|[^\]]*)?\]\+?\s*(.+)$/i);
  return m?.[2]?.trim() ?? "";
}

function normalizeTitleKey(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/^(wandern|spaziergang):\s*/i, "")
    .replace(/\s+/g, "");
}

export function parseWalkEntryMetasFromContent(content: string): WalkEntryMeta[] {
  const lines = content.split("\n");
  const out: WalkEntryMeta[] = [];

  for (const heading of ["Wandern", "Spaziergang"] as const) {
    const range = extractSectionRange(lines, heading);
    if (!range) continue;
    const profile = heading === "Wandern" ? "wandern" : "spaziergang";
    const prefix =
      profile === "wandern" ? "<!-- udn-wandern-entry:" : "<!-- udn-spaziergang-entry:";
    const sectionLines = lines.slice(range.start + 1, range.end);
    let lastTitle = "";

    for (const line of sectionLines) {
      const trimmed = stripCalloutPrefix(line);
      if (/^\[!/.test(trimmed) && !trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
        const title = calloutTitleFromLine(line);
        if (title) lastTitle = title;
        continue;
      }
      if (!trimmed.toLowerCase().startsWith(prefix.toLowerCase())) continue;
      const meta =
        profile === "wandern"
          ? parseWandernEntryMetaLine(trimmed)
          : parseSpaziergangEntryMetaLine(trimmed);
      if (!meta) continue;
      out.push({
        profile,
        titel: meta.titel.trim() || lastTitle,
        kurz: meta.kurz.trim(),
        beschreibung: meta.beschreibung.trim(),
      });
    }
  }

  return out;
}

function calloutDataType(profile: WalkEntryMeta["profile"]): string {
  return profile === "wandern" ? "mountain" : "person-walking";
}

function collectWalkCallouts(root: HTMLElement, profile: WalkEntryMeta["profile"]): HTMLElement[] {
  const dataType = calloutDataType(profile);
  return [...root.querySelectorAll<HTMLElement>(`.callout[data-callout="${dataType}"]`)];
}

function calloutShowsWalkStats(callout: HTMLElement): boolean {
  const text = callout.textContent ?? "";
  if (callout.querySelector(".udn-walk-stats")) return true;
  return /Streckenlänge:/i.test(text) && /Dauer:/i.test(text);
}

function findCalloutForMeta(
  callouts: HTMLElement[],
  meta: WalkEntryMeta,
  used: Set<HTMLElement>,
): HTMLElement | null {
  const keys = new Set(
    [meta.titel, normalizeTitleKey(meta.titel)].filter(Boolean).map(normalizeTitleKey),
  );
  for (const callout of callouts) {
    if (used.has(callout)) continue;
    const titleEl = callout.querySelector(".callout-title-inner") ?? callout.querySelector(".callout-title");
    const title = normalizeTitleKey(titleEl?.textContent ?? "");
    if (title && keys.has(title)) {
      used.add(callout);
      return callout;
    }
  }
  for (const callout of callouts) {
    if (!used.has(callout)) {
      used.add(callout);
      return callout;
    }
  }
  return null;
}

function injectWalkStats(callout: HTMLElement, statsText: string): void {
  const lines = statsText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return;

  const host = callout.querySelector(".callout-content") ?? callout;
  const wrap = document.createElement("div");
  wrap.className = "udn-walk-stats";
  for (const line of lines) {
    const p = wrap.appendChild(document.createElement("p"));
    p.textContent = line;
  }
  host.insertBefore(wrap, host.firstChild);
}

function enrichWalkCalloutStats(root: HTMLElement, metas: WalkEntryMeta[]): void {
  const byProfile: Record<WalkEntryMeta["profile"], WalkEntryMeta[]> = {
    wandern: [],
    spaziergang: [],
  };
  for (const meta of metas) {
    byProfile[meta.profile].push(meta);
  }

  for (const profile of ["wandern", "spaziergang"] as const) {
    const pending = byProfile[profile];
    if (pending.length === 0) continue;
    const callouts = collectWalkCallouts(root, profile);
    const used = new Set<HTMLElement>();
    for (const meta of pending) {
      const stats = resolveWalkBeschreibung(meta.beschreibung, meta.kurz, null);
      if (!stats.trim()) continue;
      const callout = findCalloutForMeta(callouts, meta, used);
      if (!callout || calloutShowsWalkStats(callout)) continue;
      injectWalkStats(callout, stats);
    }
  }
}

const enrichedStatsSources = new WeakMap<HTMLElement, string>();

export function registerWalkCalloutStatsEnrichment(plugin: Plugin): void {
  plugin.registerMarkdownPostProcessor((element, ctx) => {
    const sourcePath = ctx.sourcePath?.trim();
    if (!sourcePath || !/\.md$/i.test(sourcePath)) return;

    const file = plugin.app.vault.getAbstractFileByPath(sourcePath);
    if (!file || !("extension" in file)) return;

    void (async () => {
      let content = "";
      try {
        content = await plugin.app.vault.read(file as import("obsidian").TFile);
      } catch {
        return;
      }

      const metas = parseWalkEntryMetasFromContent(content);
      if (metas.length === 0) return;

      const signature = metas
        .map((m) => `${m.profile}:${m.titel}:${m.kurz}:${m.beschreibung}`)
        .join("|");
      if (enrichedStatsSources.get(element) === signature) return;
      enrichedStatsSources.set(element, signature);

      enrichWalkCalloutStats(element, metas);
    })();
  });
}
