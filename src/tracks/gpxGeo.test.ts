import { describe, expect, it } from "vitest";
import {
  admin1FromPlannedRegion,
  geocodeCacheKey,
  localityFromGeoPlace,
  trackCentroid,
  trackGeoFromGeoPlace,
} from "./gpxGeo";

describe("admin1FromPlannedRegion", () => {
  it("returns first segment before slash", () => {
    expect(admin1FromPlannedRegion("Hessen / Rhön")).toBe("Hessen");
    expect(admin1FromPlannedRegion("Bayern")).toBe("Bayern");
    expect(admin1FromPlannedRegion("")).toBe("");
  });
});

describe("geocodeCacheKey", () => {
  it("rounds to three decimals", () => {
    expect(geocodeCacheKey(50.51234, 9.87654)).toBe("50.512,9.877");
  });
});

describe("trackCentroid", () => {
  it("averages track points", () => {
    const xml = `<?xml version="1.0"?>
<gpx>
  <trk><trkseg>
    <trkpt lat="50.0" lon="9.0"><ele>100</ele></trkpt>
    <trkpt lat="52.0" lon="11.0"><ele>200</ele></trkpt>
  </trkseg></trk>
</gpx>`;
    expect(trackCentroid(xml)).toEqual({ lat: 51, lon: 10 });
  });

  it("returns null for empty gpx", () => {
    expect(trackCentroid("<gpx></gpx>")).toBeNull();
  });
});

describe("localityFromGeoPlace", () => {
  it("extracts first place name part", () => {
    expect(
      localityFromGeoPlace({
        latitude: 50.5,
        longitude: 9.8,
        placeName: "Hettenhausen, Hessen, Deutschland",
        admin1: "Hessen",
        country: "Deutschland",
      }),
    ).toBe("Hettenhausen");
  });

  it("returns empty for coordinate fallback", () => {
    expect(
      localityFromGeoPlace({
        latitude: 50.5,
        longitude: 9.8,
        placeName: "50.50°, 9.80°",
      }),
    ).toBe("");
  });
});

describe("trackGeoFromGeoPlace", () => {
  it("maps geo place to track geo", () => {
    expect(
      trackGeoFromGeoPlace({
        latitude: 50.5123,
        longitude: 9.8765,
        placeName: "Hettenhausen, Hessen, Deutschland",
        admin1: "Hessen",
        country: "Deutschland",
        county: "Landkreis Fulda",
        landscape: "Rhön",
      }),
    ).toEqual({
      admin1: "Hessen",
      locality: "Hettenhausen",
      country: "Deutschland",
      county: "Landkreis Fulda",
      landscape: "Rhön",
      lat: 50.512,
      lon: 9.877,
    });
  });
});
