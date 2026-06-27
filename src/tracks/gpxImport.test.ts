import { describe, expect, it } from "vitest";
import { dateKeyForDate, formatTrackSummary, parseGpxStats } from "./gpxImport";

const SAMPLE_GPX = `<?xml version="1.0"?>
<gpx>
  <trk>
    <trkseg>
      <trkpt lat="50.0" lon="9.0"><time>2026-06-24T08:00:00Z</time></trkpt>
      <trkpt lat="50.01" lon="9.01"><time>2026-06-24T10:00:00Z</time></trkpt>
      <trkpt lat="50.02" lon="9.02"><time>2026-06-24T12:00:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

describe("gpxImport", () => {
  it("parses distance and duration from GPX", () => {
    const stats = parseGpxStats(SAMPLE_GPX);
    expect(stats.distanceKm).toBeGreaterThan(0);
    expect(stats.durationSec).toBe(4 * 3600);
    expect(stats.start?.lat).toBe(50);
    expect(stats.end?.lat).toBe(50.02);
  });

  it("formats track summary", () => {
    const summary = formatTrackSummary({
      path: "Calendar/Tracks/2026-06-24.gpx",
      name: "2026-06-24-Wanderung.gpx",
      distanceKm: 14.2,
      durationSec: 15300,
      startLabel: null,
      endLabel: null,
    });
    expect(summary).toContain("14,2 km");
    expect(summary).toContain("4:15 h");
  });

  it("builds date key", () => {
    expect(dateKeyForDate(new Date(2026, 5, 24))).toBe("2026-06-24");
  });
});
