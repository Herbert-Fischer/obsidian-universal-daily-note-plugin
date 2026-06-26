import { describe, expect, it } from "vitest";
import { weatherCodeLabel } from "./weatherCodes";

describe("weatherCodeLabel", () => {
  it("maps clear sky", () => {
    expect(weatherCodeLabel(0)).toEqual({ label: "klar", emoji: "☀️" });
  });

  it("maps rain", () => {
    expect(weatherCodeLabel(61).label).toBe("Regen");
    expect(weatherCodeLabel(61).emoji).toBe("🌧️");
  });

  it("maps thunderstorm", () => {
    expect(weatherCodeLabel(95).label).toBe("Gewitter");
  });

  it("falls back for unknown codes", () => {
    expect(weatherCodeLabel(200).label).toBe("unbekannt");
  });
});
