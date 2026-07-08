import { describe, expect, it } from "vitest";
import {
  entryMatchesFeedContextFilter,
  entryMatchesFeedProfileFilter,
  formatFeedMetadataComment,
  inferFeedMetadataFromLine,
  parseFeedMetadataComment,
  resolveFeedMetadata,
} from "./feedMetadata";

describe("feedMetadata", () => {
  it("formats and parses metadata comments", () => {
    const comment = formatFeedMetadataComment({ profile: "reisen", context: 'Mamas 90ter Geburtstag' });
    expect(comment).toContain('profile=reisen');
    expect(parseFeedMetadataComment(comment)).toEqual({
      profile: "reisen",
      context: "Mamas 90ter Geburtstag",
    });
  });

  it("infers heizung from hub links", () => {
    const meta = inferFeedMetadataFromLine(
      "Warmwasser ([[EFH Hettenhausen]]) ([[Heizungs-Tagebuch]])",
    );
    expect(meta.profile).toBe("heizung");
  });

  it("infers spaziergang and wandern from line prefixes", () => {
    expect(inferFeedMetadataFromLine("Spaziergang: Dorfrunde")).toEqual({
      profile: "spaziergang",
      context: "Dorfrunde",
    });
    expect(inferFeedMetadataFromLine("Wandern: Alpen")).toEqual({
      profile: "wandern",
      context: "Alpen",
    });
    expect(inferFeedMetadataFromLine("Spaziergang:")).toEqual({
      profile: "spaziergang",
      context: "",
    });
  });

  it("resolves metadata from bullet text", () => {
    const meta = resolveFeedMetadata(
      "- 12:00 Filter gewechselt ([[Lüftungs-Tagebuch]])",
      "12:00 Filter gewechselt ([[Lüftungs-Tagebuch]])",
    );
    expect(meta.profile).toBe("lueftung");
  });

  it("filters by profile and context", () => {
    expect(entryMatchesFeedProfileFilter("heizung", "heizung")).toBe(true);
    expect(entryMatchesFeedProfileFilter("tagebuch", "heizung")).toBe(false);
    expect(entryMatchesFeedProfileFilter(undefined, "tagebuch")).toBe(true);
    expect(entryMatchesFeedContextFilter("Rhön", "rh")).toBe(true);
    expect(entryMatchesFeedContextFilter("Rhön", "alps")).toBe(false);
  });
});
