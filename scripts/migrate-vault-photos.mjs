#!/usr/bin/env node
/**
 * Vault migration: legacy daily-note photos → Calendar/Anhänge/Bilder/<date>/<Callout>_NN.ext
 * Handles Calendar/Attachments/ and legacy Wandern folders (Bilder/<Titel>/01.jpg).
 * Usage: node scripts/migrate-vault-photos.mjs /vault
 */
import fs from "node:fs/promises";
import path from "node:path";

const vaultRoot = process.argv[2] ?? "/vault";
const notesDir = path.join(vaultRoot, "Calendar/Notes");
const photosBase = "Calendar/Anhänge/Bilder";
const legacyPrefix = "Calendar/Attachments/";
const dateFolderRe = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function dateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function folderFromCalloutTitel(titel) {
  const raw = titel.trim() || "Tagebuch";
  return (
    raw
      .replace(/[\\:*?"<>|]/g, "")
      .replace(/\s*[·:\-–—]\s*/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 64) || "Tagebuch"
  );
}

function buildDestPath(date, photoIndex, calloutTitle, oldPath) {
  const stem = folderFromCalloutTitel(calloutTitle);
  const extMatch = /\.([a-zA-Z0-9]{1,8})$/.exec(oldPath);
  const ext = extMatch ? extMatch[1].toLowerCase() : "jpg";
  const num = String(photoIndex + 1).padStart(2, "0");
  return `${photosBase}/${dateKey(date)}/${stem}_${num}.${ext}`;
}

function parseDateFromNote(fileName) {
  const m = fileName.match(/(\d{4})-(\d{2})-(\d{2})\.md$/i);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function collectImagePaths(text) {
  const paths = [];
  for (const m of text.matchAll(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
    const p = m[1]?.trim();
    if (p) paths.push(p);
  }
  return paths;
}

function isLegacyAttachment(p) {
  return p.startsWith(legacyPrefix);
}

function isLegacyWandernFolder(p) {
  if (!p.startsWith(`${photosBase}/`)) return false;
  const rest = p.slice(`${photosBase}/`.length);
  const slash = rest.indexOf("/");
  if (slash < 0) return false;
  return !dateFolderRe.test(rest.slice(0, slash));
}

function sortPaths(paths) {
  return [...paths].sort((a, b) => {
    const fc = a.localeCompare(b);
    if (fc !== 0) return fc;
    return (a.split("/").pop() ?? "").localeCompare(b.split("/").pop() ?? "", undefined, { numeric: true });
  });
}

function tagebuchTitle(lines) {
  for (const line of lines) {
    const m = line.match(/^>\s*\[!tagebuch-ref\]\s*(.+)$/i);
    if (m?.[1]) return m[1].trim();
  }
  return "Tagebuch";
}

function wandernTitle(lines) {
  for (const line of lines) {
    const m = line.match(/^>\s*\[!mountain\][^]]*\]\s*(.+)$/i) || line.match(/^>\s*\[!mountain\]\+?\s*(.+)$/i);
    if (m?.[1]) return m[1].trim();
  }
  for (const line of lines) {
    if (!line.includes("udn-wandern:")) continue;
    const jsonStart = line.indexOf("{");
    const jsonEnd = line.lastIndexOf("}");
    if (jsonStart < 0) continue;
    try {
      const meta = JSON.parse(line.slice(jsonStart, jsonEnd + 1));
      if (meta.titel?.trim()) return meta.titel.trim();
    } catch {
      /* ignore */
    }
  }
  return "Wandern";
}

function legacyGroups(text, lines) {
  const all = collectImagePaths(text);
  const groups = [];
  const attachments = sortPaths([...new Set(all.filter(isLegacyAttachment))]);
  if (attachments.length) groups.push({ paths: attachments, title: tagebuchTitle(lines) });
  const wandern = sortPaths([...new Set(all.filter(isLegacyWandernFolder))]);
  if (wandern.length) groups.push({ paths: wandern, title: wandernTitle(lines) });
  return groups;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function migrateNote(notePath) {
  const fileName = path.basename(notePath);
  const date = parseDateFromNote(fileName);
  if (!date) return { moved: 0, updated: false };

  let text = await fs.readFile(notePath, "utf8");
  const lines = text.split("\n");
  const groups = legacyGroups(text, lines);
  if (groups.length === 0) return { moved: 0, updated: false };

  let moved = 0;

  for (const group of groups) {
    for (let i = 0; i < group.paths.length; i++) {
      const oldPath = group.paths[i];
      const newRel = buildDestPath(date, i, group.title, oldPath);
      const oldAbs = path.join(vaultRoot, oldPath);
      const newAbs = path.join(vaultRoot, newRel);

      try {
        await ensureDir(path.dirname(newAbs));
        if (await fs.stat(oldAbs).then(() => true).catch(() => false)) {
          await fs.rename(oldAbs, newAbs);
          moved++;
        } else if (!(await fs.stat(newAbs).then(() => true).catch(() => false))) {
          console.warn(`  skip missing: ${oldPath}`);
          continue;
        }
        text = text.split(oldPath).join(newRel);
      } catch (e) {
        console.warn(`  error ${oldPath}:`, e.message);
      }
    }
  }

  if (moved > 0) {
    await fs.writeFile(notePath, text, "utf8");
    return { moved, updated: true };
  }
  return { moved, updated: false };
}

async function main() {
  const entries = await fs.readdir(notesDir);
  let totalMoved = 0;
  let totalUpdated = 0;

  for (const name of entries.filter((n) => /^\d{4}-\d{2}-\d{2}\.md$/.test(n))) {
    const notePath = path.join(notesDir, name);
    const result = await migrateNote(notePath);
    if (result.moved > 0) {
      console.log(`${name}: ${result.moved} photo(s) migrated`);
      totalMoved += result.moved;
      if (result.updated) totalUpdated++;
    }
  }

  console.log(`Done: ${totalMoved} files moved, ${totalUpdated} notes updated`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
