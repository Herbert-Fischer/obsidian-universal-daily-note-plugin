import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrateDailyNoteContent } from "./migrateDailyNote";
import { isLegacyMisplacedSonstigesTripCallout } from "./journalCallout";
import { extractSectionRange } from "./journalCallout";

const VAULT_DIR = "/vault/Calendar/Notes";
const DRY_RUN = process.env.MIGRATE_DRY_RUN === "1";

function dateKeyFromName(name: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})\.md$/i.exec(name);
  return m?.[1] ?? null;
}

function hasMisplacedReisenTrip(content: string): boolean {
  const lines = content.split("\n");
  const range = extractSectionRange(lines, "Sonstiges");
  if (!range) return false;
  for (let i = range.start + 1; i < range.end; i++) {
    if (isLegacyMisplacedSonstigesTripCallout(lines[i] ?? "")) return true;
  }
  return false;
}

describe.runIf(process.env.RUN_REISEN_TRIP_MIGRATE === "1")("migrate misplaced Reisen trips in vault", () => {
  it("moves Sonstiges trip callouts to ## Reisen", () => {
    let changed = 0;

    for (const name of readdirSync(VAULT_DIR).sort()) {
      const dateKey = dateKeyFromName(name);
      if (!dateKey) continue;
      const path = join(VAULT_DIR, name);
      const before = readFileSync(path, "utf8");
      if (!hasMisplacedReisenTrip(before)) continue;

      const after = migrateDailyNoteContent(before, dateKey);
      expect(after, `failed: ${name}`).not.toBeNull();
      expect(after).not.toBe(before);
      changed++;
      if (!DRY_RUN) writeFileSync(path, after!, "utf8");
    }

    console.log(`${DRY_RUN ? "[dry-run] " : ""}reisen-trip changed=${changed}`);
    expect(changed).toBeGreaterThan(0);
  });
});
