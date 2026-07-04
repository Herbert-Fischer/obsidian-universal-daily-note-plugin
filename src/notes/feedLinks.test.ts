import { describe, expect, it } from "vitest";
import { splitFeedLineContent } from "./feedLinks";

describe("feedLinks", () => {
  it("splitFeedLineContent separates body and link suffix", () => {
    const split = splitFeedLineContent(
      "Installation Wasserversorgung ([[EFH Hettenhausen]]) ([[Heizungs-Tagebuch]])",
    );
    expect(split.body).toBe("Installation Wasserversorgung");
    expect(split.linksMarkdown).toBe("([[EFH Hettenhausen]]) ([[Heizungs-Tagebuch]])");
  });

  it("splitFeedLineContent keeps dot-separated link groups", () => {
    const split = splitFeedLineContent("Lüftungswartung ([[EFH Hettenhausen]] · [[Lüftungs-Tagebuch]])");
    expect(split.body).toBe("Lüftungswartung");
    expect(split.linksMarkdown).toBe("([[EFH Hettenhausen]] · [[Lüftungs-Tagebuch]])");
  });
});
