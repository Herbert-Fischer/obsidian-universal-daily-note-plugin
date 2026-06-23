import { describe, expect, it } from "vitest";
import { buildLogLine, ensureSectionHeading, findInsertIndex } from "./appendLogLine";

describe("appendLogLine exports", () => {
  it("builds log line with embeds", () => {
    const line = buildLogLine(
      "Mittagessen: Test",
      "14:30",
      undefined,
      ["Calendar/Attachments/2026-01-27/x.jpg"],
    );
    expect(line).toBe(
      "- 14:30 Mittagessen: Test ![[Calendar/Attachments/2026-01-27/x.jpg]]",
    );
  });

  it("creates missing section heading", () => {
    const next = ensureSectionHeading(["# Daily", ""], "Sonstiges");
    expect(next).toEqual(["# Daily", "", "## Sonstiges", ""]);
  });

  it("finds insert index under heading", () => {
    const lines = ["## Tagebuch", "- a", "- b", "## Sonstiges", "- c"];
    expect(findInsertIndex(lines, "Tagebuch")).toBe(3);
    expect(findInsertIndex(lines, "Sonstiges")).toBe(5);
  });
});
