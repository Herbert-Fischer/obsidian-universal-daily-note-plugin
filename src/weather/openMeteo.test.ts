import { describe, expect, it } from "vitest";
import { geocodeResultScore, geocodeSearchCandidates } from "./openMeteo";

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
