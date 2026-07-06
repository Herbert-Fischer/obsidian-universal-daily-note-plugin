import { afterEach, describe, expect, it, vi } from "vitest";
import type { App, TFile } from "obsidian";
import { processVaultFile, resetVaultFileLocksForTests, suppressVaultMetadataNotify, notifyVaultFileChanged } from "./vaultProcess";

function mockFile(path: string): TFile {
  return { path } as TFile;
}

describe("processVaultFile", () => {
  afterEach(() => {
    resetVaultFileLocksForTests();
  });

  it("serializes concurrent writes for the same file", async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let disk = "note";

    const app = {
      workspace: { getLeavesOfType: () => [] },
      metadataCache: { trigger: vi.fn() },
      vault: {
        adapter: {
          read: vi.fn(async () => disk),
          write: vi.fn(async (_path: string, content: string) => {
            order.push(`write:${content}`);
            if (order.length === 1) {
              await firstGate;
            }
            disk = content;
          }),
        },
      },
    } as unknown as App;

    const file = mockFile("Calendar/Notes/2026-07-01.md");
    const first = processVaultFile(app, file, (raw) => `${raw}-a`);
    const second = processVaultFile(app, file, (raw) => `${raw}-b`);

    await vi.waitFor(() => expect(order.length).toBe(1));

    releaseFirst();
    await Promise.all([first, second]);

    expect(order).toEqual(["write:note-a", "write:note-a-b"]);
    expect(app.vault.adapter.write).toHaveBeenCalledTimes(2);
  });

  it("continues the queue after a failed write", async () => {
    let disk = "note";
    const app = {
      workspace: { getLeavesOfType: () => [] },
      metadataCache: { trigger: vi.fn() },
      vault: {
        adapter: {
          read: vi.fn(async () => disk),
          write: vi
            .fn()
            .mockRejectedValueOnce(new Error("disk full"))
            .mockImplementation(async (_path: string, content: string) => {
              disk = content;
            }),
        },
      },
    } as unknown as App;

    const file = mockFile("Calendar/Notes/2026-07-02.md");
    await expect(processVaultFile(app, file, (raw) => `${raw}!`)).rejects.toThrow("disk full");
    await expect(processVaultFile(app, file, (raw) => `${raw}-ok`)).resolves.toBeUndefined();
    expect(app.vault.adapter.write).toHaveBeenCalledTimes(2);
    expect(disk).toBe("note-ok");
  });

  it("defers stat touch until batch completes", async () => {
    let disk = "note";
    const stat = vi.fn(async () => ({ mtime: 1, ctime: 1, size: disk.length }));
    const app = {
      workspace: { getLeavesOfType: () => [] },
      metadataCache: { trigger: vi.fn() },
      vault: {
        adapter: {
          read: vi.fn(async () => disk),
          write: vi.fn(async (_path: string, content: string) => {
            disk = content;
          }),
          stat,
        },
      },
    } as unknown as App;

    const file = mockFile("Calendar/Notes/2026-07-03.md");
    const release = suppressVaultMetadataNotify();
    try {
      await processVaultFile(app, file, (raw) => `${raw}-a`);
      await processVaultFile(app, file, (raw) => `${raw}-b`);
      expect(stat).not.toHaveBeenCalled();
      await notifyVaultFileChanged(app, file);
    } finally {
      release();
    }
    expect(stat).toHaveBeenCalledTimes(1);
    expect(disk).toBe("note-a-b");
  });
});
