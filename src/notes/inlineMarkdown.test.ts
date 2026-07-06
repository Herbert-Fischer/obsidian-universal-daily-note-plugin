import { describe, expect, it } from "vitest";
import { inlineMarkdownHasMarkup, parseInlineMarkdown } from "./inlineMarkdown";

describe("inlineMarkdown", () => {
  it("parses bold and italic", () => {
    const segs = parseInlineMarkdown("**fett** und *kursiv*");
    expect(segs).toEqual([
      { kind: "strong", value: "fett" },
      { kind: "text", value: " und " },
      { kind: "em", value: "kursiv" },
    ]);
  });

  it("keeps spaces before and after bold", () => {
    expect(parseInlineMarkdown("vor **fett** nach")).toEqual([
      { kind: "text", value: "vor " },
      { kind: "strong", value: "fett" },
      { kind: "text", value: " nach" },
    ]);
  });

  it("parses strikethrough, code, and highlight", () => {
    const segs = parseInlineMarkdown("~~alt~~ `code` ==mark==");
    expect(segs).toEqual([
      { kind: "del", value: "alt" },
      { kind: "text", value: " " },
      { kind: "code", value: "code" },
      { kind: "text", value: " " },
      { kind: "mark", value: "mark" },
    ]);
  });

  it("prefers bold over single asterisk", () => {
    expect(parseInlineMarkdown("**bold**")).toEqual([{ kind: "strong", value: "bold" }]);
  });

  it("detects markup", () => {
    expect(inlineMarkdownHasMarkup("plain")).toBe(false);
    expect(inlineMarkdownHasMarkup("**bold**")).toBe(true);
  });
});
