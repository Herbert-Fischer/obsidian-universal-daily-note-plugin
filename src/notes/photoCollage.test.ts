import { describe, expect, it } from "vitest";
import {
  PHOTO_GALLERY_ROW,
  buildPhotoCollageBlock,
  buildPhotoCollageMarkdown,
  galleryLayoutForPhotoCount,
  parsePhotoCollageFromLines,
  parsePhotoCollageMetaLine,
  photoCollageMetaComment,
} from "./photoCollage";

describe("photoCollage", () => {
  it("galleryLayoutForPhotoCount always uses gallery-row", () => {
    expect(galleryLayoutForPhotoCount(0)).toBe("");
    expect(galleryLayoutForPhotoCount(1)).toBe(PHOTO_GALLERY_ROW);
    expect(galleryLayoutForPhotoCount(4)).toBe(PHOTO_GALLERY_ROW);
  });

  it("buildPhotoCollageBlock emits horizontal gallery callout", () => {
    const block = buildPhotoCollageBlock(["Calendar/a.jpg", "Calendar/b.jpg"], PHOTO_GALLERY_ROW, "> > ");
    expect(block).toContain("[!blank-container|no-margin gallery gallery-row]");
    expect(block).toContain("> > ![[Calendar/a.jpg]] ![[Calendar/b.jpg]]");
  });

  it("buildPhotoCollageMarkdown defaults to gallery-row", () => {
    const block = buildPhotoCollageMarkdown(["a.jpg"], "> > > ");
    expect(block).toContain(PHOTO_GALLERY_ROW);
    expect(block).toContain("![[a.jpg]]");
  });

  it("parsePhotoCollageFromLines reads gallery and legacy stacks", () => {
    const lines = [
      "> Detail text",
      ">",
      "> > [!blank-container|no-margin gallery collage-2-mixed]",
      "> > ![[a.jpg]] ![[b.jpg]]",
      "> ![[legacy.jpg]]",
    ];
    const parsed = parsePhotoCollageFromLines(lines, 0, lines.length);
    expect(parsed.photos).toEqual(["a.jpg", "b.jpg", "legacy.jpg"]);
    expect(parsed.layout).toBe(PHOTO_GALLERY_ROW);
  });

  it("round-trips udn-photos meta comment as gallery-row", () => {
    const line = photoCollageMetaComment({
      fotos: ["a.jpg", "b.jpg"],
      layout: PHOTO_GALLERY_ROW,
    });
    const parsed = parsePhotoCollageMetaLine(line);
    expect(parsed?.fotos).toEqual(["a.jpg", "b.jpg"]);
    expect(parsed?.layout).toBe(PHOTO_GALLERY_ROW);
  });
});
