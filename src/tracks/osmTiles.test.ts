import { describe, expect, it } from "vitest";
import {
  geoBoundsFromPoints,
  latLonToMapPixel,
  latToTileY,
  lonToTileX,
  mapAttribution,
  pickZoomForBounds,
} from "./osmTiles";
import type { GpxTrackPoint } from "./gpxImport";

const sample: GpxTrackPoint[] = [
  { lat: 47.57, lon: 10.55, ele: 850 },
  { lat: 47.575, lon: 10.56, ele: 900 },
];

describe("osmTiles", () => {
  it("geoBoundsFromPoints adds padding", () => {
    const b = geoBoundsFromPoints(sample, 0.2);
    expect(b.minLat).toBeLessThan(47.57);
    expect(b.maxLat).toBeGreaterThan(47.575);
    expect(b.minLon).toBeLessThan(10.55);
    expect(b.maxLon).toBeGreaterThan(10.56);
  });

  it("pickZoomForBounds returns sensible zoom", () => {
    const b = geoBoundsFromPoints(sample);
    const z = pickZoomForBounds(b);
    expect(z).toBeGreaterThanOrEqual(11);
    expect(z).toBeLessThanOrEqual(16);
  });

  it("latLonToMapPixel maps inside canvas", () => {
    const b = geoBoundsFromPoints(sample, 0);
    const p = latLonToMapPixel(47.57, 10.55, b, 400, 200);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(400);
    expect(p.y).toBeLessThanOrEqual(200);
  });

  it("tile coordinate helpers are monotonic", () => {
    expect(lonToTileX(10.56, 14)).toBeGreaterThan(lonToTileX(10.55, 14));
    expect(latToTileY(47.57, 14)).toBeGreaterThan(latToTileY(47.575, 14));
  });

  it("mapAttribution mentions sources", () => {
    expect(mapAttribution("topo")).toContain("OpenTopoMap");
    expect(mapAttribution("osm")).toContain("OpenStreetMap");
  });
});
