import { describe, expect, it } from "vitest";
import { buildAttachmentVaultPath, wikiEmbedForPath } from "./attachJournalMedia";

describe("attachJournalMedia", () => {
  it("builds dated attachment path with sanitized name", () => {
    const date = new Date(2026, 0, 27, 14, 30, 52);
    const path = buildAttachmentVaultPath(date, "Calendar/Attachments", "Mein Foto.JPG");
    expect(path).toMatch(/^Calendar\/Attachments\/2026-01-27\/143052-mein-foto\.jpg$/);
  });

  it("creates wiki embed syntax", () => {
    expect(wikiEmbedForPath("Calendar/Attachments/2026-01-27/x.jpg")).toBe(
      "![[Calendar/Attachments/2026-01-27/x.jpg]]",
    );
  });
});
