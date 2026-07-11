import { describe, expect, it } from "vitest";
import {
  composerTimeInputType,
  composerTimeInputValue,
  normalizeComposerTimeValue,
  openComposerTimePicker,
} from "./composerTimeField";

describe("composerTimeField", () => {
  it("normalizes valid HH:mm values", () => {
    expect(normalizeComposerTimeValue("9:5")).toBe("09:05");
    expect(normalizeComposerTimeValue("09:15")).toBe("09:15");
    expect(normalizeComposerTimeValue(" 23:59 ")).toBe("23:59");
  });

  it("rejects invalid values", () => {
    expect(normalizeComposerTimeValue("")).toBe("");
    expect(normalizeComposerTimeValue("abc")).toBe("");
    expect(normalizeComposerTimeValue("25:00")).toBe("23:00");
  });

  it("uses native time input on mobile", () => {
    expect(composerTimeInputType(true)).toBe("time");
    expect(composerTimeInputType(false)).toBe("text");
    expect(composerTimeInputValue("7:30", true)).toBe("07:30");
    expect(composerTimeInputValue("7:30", false)).toBe("7:30");
  });

  it("calls showPicker when available", () => {
    const input = document.createElement("input");
    input.type = "time";
    let called = false;
    input.showPicker = () => {
      called = true;
    };
    openComposerTimePicker(input);
    expect(called).toBe(true);
  });
});
