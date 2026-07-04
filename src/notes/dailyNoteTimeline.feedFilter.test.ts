import { describe, expect, it } from "vitest";
import { applyFeedFiltersToEntries, type TimelineEntry } from "./dailyNoteTimeline";

function entry(
  text: string,
  profile: TimelineEntry["feedProfile"] = "tagebuch",
  context?: string,
  line = 1,
): TimelineEntry {
  return { line, text, rawLine: `- ${text}`, feedProfile: profile, feedContext: context };
}

describe("applyFeedFiltersToEntries", () => {
  const mixedDay = [
    entry("07:30 Aufstehen", "tagebuch", undefined, 1),
    entry("13:06 Fahrt nach Obernburg", "reisen", "Erbach", 2),
    entry("14:00 Besuch", "tagebuch", undefined, 3),
    entry("Gipfel", "wandern", "Tour", 4),
  ];

  it("shows only matching profiles when rest is off", () => {
    const filtered = applyFeedFiltersToEntries(mixedDay, "Tagebuch", ["reisen"], "", false);
    expect(filtered.map((e) => e.text)).toEqual(["13:06 Fahrt nach Obernburg"]);
  });

  it("adds plain tagebuch lines on days that have a profile match when rest is on", () => {
    const filtered = applyFeedFiltersToEntries(mixedDay, "Tagebuch", ["reisen"], "", true);
    expect(filtered.map((e) => e.text)).toEqual([
      "07:30 Aufstehen",
      "13:06 Fahrt nach Obernburg",
      "14:00 Besuch",
    ]);
  });

  it("hides days with only plain tagebuch when rest is on but no profile match", () => {
    const onlyTagebuch = [
      entry("07:30 Aufstehen", "tagebuch", undefined, 1),
      entry("11:00 Spaziergang", "tagebuch", undefined, 2),
    ];
    expect(applyFeedFiltersToEntries(onlyTagebuch, "Tagebuch", ["reisen"], "", true)).toEqual([]);
  });

  it("hides days with only other profiles when filtering reisen", () => {
    const onlyWandern = [entry("Gipfel", "wandern", "Tour", 1)];
    expect(applyFeedFiltersToEntries(onlyWandern, "Tagebuch", ["reisen"], "", false)).toEqual([]);
  });

  it("uses OR logic for multiple profile filters", () => {
    const filtered = applyFeedFiltersToEntries(mixedDay, "Tagebuch", ["reisen", "wandern"], "", false);
    expect(filtered.map((e) => e.text)).toEqual([
      "13:06 Fahrt nach Obernburg",
      "Gipfel",
    ]);
  });
});
