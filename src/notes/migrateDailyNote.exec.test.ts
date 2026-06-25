import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrateDailyNoteContent } from "./migrateDailyNote";

const VAULT_DIR = "/vault/Calendar/Notes";
const DRY_RUN = process.env.MIGRATE_DRY_RUN === "1";

function dateKeyFromName(name: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})\.md$/i.exec(name);
  return m?.[1] ?? null;
}

describe.runIf(process.env.RUN_DAILY_NOTE_MIGRATE === "1")("migrate daily notes in vault", () => {
  it("migrates Calendar/Notes to new format", () => {
    let changed = 0;
    let unchanged = 0;

    for (const name of readdirSync(VAULT_DIR).sort()) {
      const dateKey = dateKeyFromName(name);
      if (!dateKey) continue;
      const path = join(VAULT_DIR, name);
      const before = readFileSync(path, "utf8");
      const after = migrateDailyNoteContent(before, dateKey);
      expect(after, `failed: ${name}`).not.toBeNull();
      if (after === before) {
        unchanged++;
        continue;
      }
      changed++;
      if (!DRY_RUN) writeFileSync(path, after!, "utf8");
    }

    console.log(`${DRY_RUN ? "[dry-run] " : ""}changed=${changed} unchanged=${unchanged}`);
    expect(changed + unchanged).toBeGreaterThan(0);
  });
});
