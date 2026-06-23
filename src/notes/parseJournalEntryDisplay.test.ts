import { describe, expect, it } from "vitest";
import { parseJournalEntryDisplay } from "./parseJournalEntryDisplay";

describe("parseJournalEntryDisplay", () => {
  it("extracts leading time", () => {
    expect(parseJournalEntryDisplay("07:10 Aufstehen")).toEqual({
      time: "07:10",
      body: "Aufstehen",
    });
  });

  it("leaves lines without time unchanged", () => {
    expect(parseJournalEntryDisplay("Blumen gegossen")).toEqual({
      time: null,
      body: "Blumen gegossen",
    });
  });

  it("keeps wikilinks in body", () => {
    expect(parseJournalEntryDisplay("14:00 Eis mit [[Mona]]")).toEqual({
      time: "14:00",
      body: "Eis mit [[Mona]]",
    });
  });
});
