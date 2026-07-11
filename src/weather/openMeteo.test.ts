import { describe, expect, it } from "vitest";
import { geocodeResultScore, geocodeSearchCandidates, nominatimAddressToPlaceFields } from "./openMeteo";

describe("geocodeSearchCandidates", () => {
  it("falls back to city name from full place label", () => {
    expect(geocodeSearchCandidates("Gersfeld, Hessen, Deutschland")).toEqual([
      "Gersfeld, Hessen, Deutschland",
      "Gersfeld, Hessen",
      "Gersfeld",
    ]);
  });

  it("keeps simple queries unchanged", () => {
    expect(geocodeSearchCandidates("Berlin")).toEqual(["Berlin"]);
  });
});

describe("geocodeResultScore", () => {
  it("prefers matching region and country", () => {
    const hit = { name: "Gersfeld", admin1: "Hessen", country: "Deutschland" };
    expect(geocodeResultScore(hit, "Gersfeld, Hessen, Deutschland")).toBe(40);
    expect(geocodeResultScore(hit, "Gersfeld, Bayern, Deutschland")).toBe(30);
  });
});

describe("nominatimAddressToPlaceFields", () => {
  it("prefers village over municipality for the place name", () => {
    expect(
      nominatimAddressToPlaceFields({
        village: "Gersfeld",
        municipality: "Gersfeld (Rhön)",
        state: "Hessen",
        country: "Deutschland",
      }),
    ).toEqual({
      name: "Gersfeld",
      admin1: "Hessen",
      country: "Deutschland",
      county: undefined,
      landscape: "Rhön",
    });
  });

  it("extracts county from nominatim address", () => {
    expect(
      nominatimAddressToPlaceFields({
        town: "Pfronten",
        county: "Landkreis Ostallgäu",
        state: "Bayern",
        country: "Deutschland",
      }),
    ).toEqual({
      name: "Pfronten",
      admin1: "Bayern",
      country: "Deutschland",
      county: "Landkreis Ostallgäu",
      landscape: undefined,
    });
  });

  it("falls back to town or city when village is missing", () => {
    expect(
      nominatimAddressToPlaceFields({
        town: "Erbach",
        state: "Hessen",
        country: "Deutschland",
      }).name,
    ).toBe("Erbach");
    expect(
      nominatimAddressToPlaceFields({
        city: "Berlin",
        state: "Berlin",
        country: "Deutschland",
      }).name,
    ).toBe("Berlin");
  });
});
