import { describe, expect, it } from "vitest";
import { buildLogLineForTest, findInsertIndexForTest } from "../notes/appendLogLine.testHelpers";

describe("appendLogLine helpers", () => {
  it("buildLogLine includes time and link", () => {
    const line = buildLogLineForTest("Notiz", "14:30", "Alice");
    expect(line).toBe("- 14:30 Notiz [[Alice]]");
  });

  it("findInsertIndex inserts after matching heading", () => {
    const lines = ["# Log", "- alt", "## Other", "x"];
    expect(findInsertIndexForTest(lines, "Log")).toBe(2);
  });

  it("findInsertIndex appends when heading missing", () => {
    const lines = ["# A"];
    expect(findInsertIndexForTest(lines, "Missing")).toBe(1);
  });
});
