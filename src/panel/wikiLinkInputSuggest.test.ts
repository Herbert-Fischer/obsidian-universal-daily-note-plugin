import { describe, expect, it } from "vitest";
import { replaceWikiPartial, wikiQueryBeforeCursor } from "./wikiLinkInputParse";

describe("wikiQueryBeforeCursor", () => {
  it("detects partial link after [[", () => {
    expect(wikiQueryBeforeCursor("Treffen mit [[Ma", 17)).toBe("Ma");
  });

  it("returns null outside wikilink", () => {
    expect(wikiQueryBeforeCursor("normal text", 11)).toBeNull();
  });
});

describe("replaceWikiPartial", () => {
  it("inserts completed wikilink", () => {
    const value = "Notiz [[Ma";
    const cursor = value.length;
    const { next, cursor: nextCursor } = replaceWikiPartial(value, cursor, "[[Mama]]");
    expect(next).toBe("Notiz [[Mama]]");
    expect(nextCursor).toBe(next.length);
  });
});
