import { describe, expect, it } from "vitest";
import {
  appendWeatherToCalloutTitle,
  formatLocationFrontmatter,
  formatWeatherJournalBody,
  formatWeatherSummaryShort,
  prependWeatherToSummary,
} from "./weatherFormat";

describe("appendWeatherToCalloutTitle", () => {
  it("uses weather only when title is empty", () => {
    expect(appendWeatherToCalloutTitle("", "☀️ 22 °C klar, Erbach")).toBe("☀️ 22 °C klar, Erbach");
  });

  it("appends weather and keeps existing title", () => {
    expect(appendWeatherToCalloutTitle("24.06.2026", "☀️ 22 °C klar, Erbach")).toBe(
      "24.06.2026 · ☀️ 22 °C klar, Erbach",
    );
  });

  it("does not duplicate an identical suffix", () => {
    const merged = "24.06.2026 · ☀️ 22 °C klar, Erbach";
    expect(appendWeatherToCalloutTitle(merged, "☀️ 22 °C klar, Erbach")).toBe(merged);
  });
});

describe("formatWeatherJournalBody", () => {
  it("wraps place in wikilink", () => {
    const body = formatWeatherJournalBody({
      placeName: "Erbach, Hessen",
      dateKey: "2026-06-24",
      isHistorical: false,
      temperatureC: 18,
      weatherCode: 2,
      windKmh: 5,
    });
    expect(body).toMatch(/^\[\[Erbach, Hessen\]\]/);
    expect(body).toContain("18 °C");
  });
});

describe("prependWeatherToSummary", () => {
  it("uses weather only when summary is empty", () => {
    expect(prependWeatherToSummary("", "☀️ 22 °C klar, Erbach")).toBe("☀️ 22 °C klar, Erbach");
  });

  it("prepends weather and keeps existing text", () => {
    expect(prependWeatherToSummary("Pizza; Spaziergang", "☀️ 22 °C klar, Erbach")).toBe(
      "☀️ 22 °C klar, Erbach · Pizza; Spaziergang",
    );
  });

  it("does not duplicate an identical prefix", () => {
    const merged = "☀️ 22 °C klar, Erbach · Pizza";
    expect(prependWeatherToSummary(merged, "☀️ 22 °C klar, Erbach")).toBe(merged);
  });
});

describe("formatWeatherSummaryShort", () => {
  it("formats current weather compactly", () => {
    expect(
      formatWeatherSummaryShort({
        placeName: "Erbach, Hessen, Deutschland",
        dateKey: "2026-06-24",
        isHistorical: false,
        temperatureC: 22,
        weatherCode: 0,
        windKmh: 0,
      }),
    ).toBe("☀️ 22 °C klar, Erbach");
  });
});

describe("formatLocationFrontmatter", () => {
  it("quotes values with special YAML characters", () => {
    expect(formatLocationFrontmatter('Ort: "Test"')).toBe('"Ort: \\"Test\\""');
  });

  it("returns plain text for simple names", () => {
    expect(formatLocationFrontmatter("Erbach, Hessen")).toBe("Erbach, Hessen");
  });
});
