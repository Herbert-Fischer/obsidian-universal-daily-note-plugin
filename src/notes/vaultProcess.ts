import { MarkdownView, type App, type TFile } from "obsidian";

const DEFAULT_VAULT_WRITE_TIMEOUT_MS = 10_000;
const DEFAULT_LOCK_WAIT_MS = 3_000;

const inflightWrites = new Map<string, Promise<void>>();
let metadataNotifySuppressed = 0;

/** Coalesce metadata notifications during multi-step composer saves. */
export function suppressVaultMetadataNotify(): () => void {
  metadataNotifySuppressed += 1;
  return () => {
    metadataNotifySuppressed = Math.max(0, metadataNotifySuppressed - 1);
  };
}

/** @internal Test helper — clears queued writes between unit tests. */
export function resetVaultFileLocksForTests(): void {
  inflightWrites.clear();
  metadataNotifySuppressed = 0;
}

export function withOperationTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer != null) window.clearTimeout(timer);
  });
}

/** Read note text from disk (composer owns concurrent edits). */
export async function readVaultFileContent(app: App, file: TFile): Promise<string> {
  try {
    return await app.vault.adapter.read(file.path);
  } catch {
    return "";
  }
}

function syncOpenEditor(app: App, file: TFile, content: string): void {
  for (const leaf of app.workspace.getLeavesOfType("markdown")) {
    const view = leaf.view;
    if (view instanceof MarkdownView && view.file?.path === file.path) {
      if (view.editor.getValue() !== content) {
        view.editor.setValue(content);
      }
      return;
    }
  }
}

/**
 * After adapter.write, refresh stat only. Do not call metadataCache.trigger —
 * it runs before Obsidian reparses and breaks Dataview ("no file metadata").
 * The file watcher reparses and emits metadataCache "changed" when ready.
 */
async function touchVaultFileStat(app: App, file: TFile): Promise<void> {
  try {
    const stat = await app.vault.adapter.stat(file.path);
    if (!stat) return;
    file.stat = stat;
  } catch {
    /* ignore */
  }
}

async function writeVaultFileContent(app: App, file: TFile, content: string): Promise<void> {
  await app.vault.adapter.write(file.path, content);
  syncOpenEditor(app, file, content);
  if (metadataNotifySuppressed <= 0) {
    await touchVaultFileStat(app, file);
  }
}

/** Finalize a batched save (see suppressVaultMetadataNotify). */
export async function notifyVaultFileChanged(app: App, file: TFile): Promise<void> {
  await touchVaultFileStat(app, file);
}

export type ProcessVaultFileOptions = {
  timeoutMs?: number;
  lockWaitMs?: number;
};

/** Serialized adapter write per path (bypasses vault.process / vault.modify deadlocks). */
export async function processVaultFile(
  app: App,
  file: TFile,
  mutator: (data: string) => string,
  options: ProcessVaultFileOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_VAULT_WRITE_TIMEOUT_MS;
  const lockWaitMs = options.lockWaitMs ?? DEFAULT_LOCK_WAIT_MS;
  const timeoutMessage = `Speichern dauerte länger als ${Math.round(timeoutMs / 1000)} s.`;
  const path = file.path;

  const previous = inflightWrites.get(path);
  if (previous) {
    await withOperationTimeout(previous, lockWaitMs, timeoutMessage).catch(() => undefined);
  }

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  inflightWrites.set(path, gate);

  try {
    await withOperationTimeout(
      (async () => {
        const raw = await readVaultFileContent(app, file);
        const next = mutator(raw);
        if (next === raw) return;
        await writeVaultFileContent(app, file, next);
      })(),
      timeoutMs,
      timeoutMessage,
    );
  } finally {
    release();
    if (inflightWrites.get(path) === gate) {
      inflightWrites.delete(path);
    }
  }
}
