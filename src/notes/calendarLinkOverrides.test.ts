import { describe, expect, it } from "vitest";
import { extractCalendarTermBody, collectCalendarLinkOverrides } from "./calendarLinkOverrides";
import type { ComposerEntry } from "./dailyComposer";

describe("calendarLinkOverrides", () => {
  it("extracts term body without marker or prefix", () => {
    expect(extractCalendarTermBody("Termin: [[Ort|Alias]] <!-- udn-cal:evt-1 -->")).toBe("[[Ort|Alias]]");
  });

  it("collects overrides from calendar entries", () => {
    const entries: ComposerEntry[] = [
      {
        id: "cal-evt-1",
        line: 1,
        time: "13:30",
        body: "Termin: [[Biohotel Lindengut|Lindengut]] mit [[Mona Buchmann|Mona]]",
        rawLine: "",
        calendarId: "evt-1",
      },
    ];
    expect(collectCalendarLinkOverrides(entries)).toEqual({
      "evt-1": "[[Biohotel Lindengut|Lindengut]] mit [[Mona Buchmann|Mona]]",
    });
  });
});
