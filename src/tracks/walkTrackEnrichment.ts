import type { App, Plugin } from "obsidian";
import type { WandernLayoutSettings } from "../settings";
import { extractSectionRange } from "../notes/journalCallout";
import { parseSpaziergangEntryMetaLine } from "../notes/spaziergangComposer";
import { parseWandernEntryMetaLine } from "../notes/wandernComposer";
import { mountTrack3dBlock } from "./track3dView";

export type WalkTrackMount = {
  trackPath: string;
  profile: "wandern" | "spaziergang";
};

function stripCalloutPrefix(line: string): string {
  return line.replace(/^(?:>\s*)+/, "").trim();
}

function blockHasTrack3d(sectionLines: string[], metaIndex: number): boolean {
  const blockStart = findBlockStart(sectionLines, metaIndex);
  const block = sectionLines.slice(blockStart, metaIndex).join("\n");
  return block.includes("```udn-track-3d");
}

function findBlockStart(sectionLines: string[], metaIndex: number): number {
  for (let i = metaIndex - 1; i >= 0; i--) {
    const trimmed = stripCalloutPrefix(sectionLines[i] ?? "");
    if (
      trimmed.startsWith("<!-- udn-wandern-entry:") ||
      trimmed.startsWith("<!-- udn-spaziergang-entry:")
    ) {
      return i + 1;
    }
    if (/^##\s/.test(trimmed)) return i + 1;
  }
  return 0;
}

export function parseWalkTrackMountsFromContent(content: string): WalkTrackMount[] {
  const lines = content.split("\n");
  const mounts: WalkTrackMount[] = [];

  for (const heading of ["Wandern", "Spaziergang"] as const) {
    const range = extractSectionRange(lines, heading);
    if (!range) continue;
    const sectionLines = lines.slice(range.start + 1, range.end);
    const profile = heading === "Wandern" ? "wandern" : "spaziergang";
    const prefix =
      profile === "wandern" ? "<!-- udn-wandern-entry:" : "<!-- udn-spaziergang-entry:";

    for (let i = 0; i < sectionLines.length; i++) {
      const trimmed = stripCalloutPrefix(sectionLines[i] ?? "");
      if (!trimmed.toLowerCase().startsWith(prefix.toLowerCase())) continue;
      const meta =
        profile === "wandern"
          ? parseWandernEntryMetaLine(trimmed)
          : parseSpaziergangEntryMetaLine(trimmed);
      const trackPath = meta?.trackPath?.trim() ?? "";
      if (!trackPath || blockHasTrack3d(sectionLines, i)) continue;
      mounts.push({ trackPath, profile });
    }
  }

  return mounts;
}

function calloutDataType(profile: WalkTrackMount["profile"]): string {
  return profile === "wandern" ? "mountain" : "person-walking";
}

function collectWalkCallouts(root: HTMLElement, profile: WalkTrackMount["profile"]): HTMLElement[] {
  const dataType = calloutDataType(profile);
  return [...root.querySelectorAll<HTMLElement>(`.callout[data-callout="${dataType}"]`)].filter(
    (el) => !el.querySelector(".udn-track3d"),
  );
}

function layoutForProfile(
  settings: { wandernLayout: WandernLayoutSettings; spaziergangLayout: WandernLayoutSettings },
  profile: WalkTrackMount["profile"],
): WandernLayoutSettings {
  return profile === "spaziergang" ? settings.spaziergangLayout : settings.wandernLayout;
}

async function enrichWalkCallouts(
  app: App,
  settings: { wandernLayout: WandernLayoutSettings; spaziergangLayout: WandernLayoutSettings },
  root: HTMLElement,
  mounts: WalkTrackMount[],
): Promise<void> {
  const byProfile: Record<WalkTrackMount["profile"], WalkTrackMount[]> = {
    wandern: [],
    spaziergang: [],
  };
  for (const mount of mounts) {
    byProfile[mount.profile].push(mount);
  }

  for (const profile of ["wandern", "spaziergang"] as const) {
    const pending = byProfile[profile];
    if (pending.length === 0) continue;
    const callouts = collectWalkCallouts(root, profile);
    const layout = layoutForProfile(settings, profile);
    const count = Math.min(pending.length, callouts.length);
    for (let i = 0; i < count; i++) {
      const mount = pending[i]!;
      const callout = callouts[i]!;
      const host = callout.querySelector(".callout-content") ?? callout;
      if (host.querySelector(".udn-track3d")) continue;
      const wrap = document.createElement("div");
      wrap.className = "udn-walk-track-enrichment";
      host.appendChild(wrap);
      await mountTrack3dBlock(app, wrap, {
        path: mount.trackPath,
        height: layout.track3dHeight ?? 400,
        exaggeration: layout.track3dElevationExaggeration ?? 4,
      });
    }
  }
}

const enrichedSources = new WeakMap<HTMLElement, string>();

export function registerWalkTrackEnrichment(plugin: Plugin): void {
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

      const mounts = parseWalkTrackMountsFromContent(content);
      if (mounts.length === 0) return;

      const signature = mounts.map((m) => `${m.profile}:${m.trackPath}`).join("|");
      if (enrichedSources.get(element) === signature) return;
      enrichedSources.set(element, signature);

      const plug = plugin as {
        settings?: { wandernLayout: WandernLayoutSettings; spaziergangLayout: WandernLayoutSettings };
      };
      await enrichWalkCallouts(
        plugin.app,
        {
          wandernLayout: plug.settings?.wandernLayout ?? {
            template: "",
            maxPhotos: 3,
            track3dEnabled: true,
            track3dHeight: 400,
            track3dElevationExaggeration: 4,
            photosFolder: "",
            tracksFolder: "",
          },
          spaziergangLayout: plug.settings?.spaziergangLayout ?? {
            template: "",
            maxPhotos: 3,
            track3dEnabled: true,
            track3dHeight: 400,
            track3dElevationExaggeration: 4,
            photosFolder: "",
            tracksFolder: "",
          },
        },
        element,
        mounts,
      );
    })();
  });
}
