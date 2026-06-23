import { describe, expect, it } from "vitest";
import { TFile } from "obsidian";
import { linkTargetMatches } from "../tagebuchVerweise/tagebuchVerweise";

function mockFile(path: string): TFile {
  const base = path.split("/").pop() ?? path;
  return { path, basename: base, name: base } as TFile;
}

describe("linkTargetMatches", () => {
  it("matches basename wikilink", () => {
    const target = mockFile("Atlas/Menschen/Alice.md");
    expect(linkTargetMatches("Alice", target)).toBe(true);
  });

  it("matches path wikilink with anchor", () => {
    const target = mockFile("Atlas/Menschen/Alice.md");
    expect(linkTargetMatches("Atlas/Menschen/Alice#Section", target)).toBe(true);
  });

  it("rejects unrelated link", () => {
    const target = mockFile("Atlas/Menschen/Alice.md");
    expect(linkTargetMatches("Bob", target)).toBe(false);
  });
});
