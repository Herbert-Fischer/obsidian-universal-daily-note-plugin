import { describe, expect, it } from "vitest";
import { clampComposerPosition } from "./composerDrag";

describe("composerDrag", () => {
  it("clamps position to viewport", () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "getBoundingClientRect", {
      value: () => ({ width: 400, height: 300, left: 0, top: 0, right: 400, bottom: 300 }),
    });
    const next = clampComposerPosition(9999, -50, el);
    expect(next.x).toBeGreaterThanOrEqual(0);
    expect(next.y).toBeGreaterThanOrEqual(0);
    expect(next.x).toBeLessThanOrEqual(Math.max(0, window.innerWidth - 400));
  });
});
