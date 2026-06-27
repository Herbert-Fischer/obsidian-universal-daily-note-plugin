import { describe, expect, it } from "vitest";
import {
  computeAlongTrackDistances,
  elevationColor,
  normalizeTrackPoints,
  parseTrack3dBlockSource,
  projectTrackPoint,
} from "./track3dView";
import type { GpxTrackPoint } from "./gpxImport";

const samplePoints: GpxTrackPoint[] = [
  { lat: 47.57, lon: 10.55, ele: 850 },
  { lat: 47.571, lon: 10.551, ele: 870 },
  { lat: 47.572, lon: 10.552, ele: 900 },
];

describe("track3dView", () => {
  it("parses code block source", () => {
    const opts = parseTrack3dBlockSource("path: Calendar/Tracks/a.gpx\nheight: 320\n");
    expect(opts?.path).toBe("Calendar/Tracks/a.gpx");
    expect(opts?.height).toBe(320);
    expect(opts?.exaggeration).toBe(4);
  });

  it("parses exaggeration", () => {
    const opts = parseTrack3dBlockSource(
      "path: Calendar/Tracks/a.gpx\nheight: 400\nexaggeration: 6\n",
    );
    expect(opts?.exaggeration).toBe(6);
  });

  it("returns null without path", () => {
    expect(parseTrack3dBlockSource("height: 200")).toBeNull();
  });

  it("normalizeTrackPoints scales elevation with exaggeration", () => {
    const low = normalizeTrackPoints(samplePoints, 1);
    const high = normalizeTrackPoints(samplePoints, 4);
    expect(high.zs[2]!).toBeGreaterThan(low.zs[2]!);
  });

  it("elevationColor returns rgb gradient", () => {
    expect(elevationColor(0)).toMatch(/^rgb\(/);
    expect(elevationColor(1)).not.toBe(elevationColor(0));
  });

  it("computeAlongTrackDistances is monotonic", () => {
    const { xs, ys } = normalizeTrackPoints(samplePoints, 4);
    const dist = computeAlongTrackDistances(xs, ys);
    expect(dist[0]).toBe(0);
    expect(dist[dist.length - 1]!).toBeGreaterThan(dist[0]!);
  });

  it("projectTrackPoint returns screen coords", () => {
    const { xs, ys, zs } = normalizeTrackPoints(samplePoints, 4);
    const bounds = {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
    };
    const p = projectTrackPoint(xs[0]!, ys[0]!, zs[0]!, bounds);
    expect(Number.isFinite(p.px)).toBe(true);
    expect(Number.isFinite(p.py)).toBe(true);
  });
});
