import { describe, expect, it } from "vitest";
import { stripJournalLineForDisplay } from "./journalEntryMeta";

describe("stripJournalLineForDisplay", () => {
  it("removes inline udn-entry and other udn comments", () => {
    const line =
      '13:06 Fahrt nach Obernburg [[Boxi]] <!-- udn-entry:{"id":"3m2g","profile":"reisen","context":"Erbach"} -->';
    expect(stripJournalLineForDisplay(line)).toBe("13:06 Fahrt nach Obernburg [[Boxi]]");
  });

  it("removes udn-cal sync markers", () => {
    const line = "13:30 Termin <!-- udn-cal:caldav:event:abc -->";
    expect(stripJournalLineForDisplay(line)).toBe("13:30 Termin");
  });

  it("removes managed callout markers like [!fire]+", () => {
    const line = "[!fire]+ jährliche Heizungswartung ([[Heizung]])";
    expect(stripJournalLineForDisplay(line)).toBe("jährliche Heizungswartung ([[Heizung]])");
  });

  it("removes callout markers with leading blockquote", () => {
    const line = "> [!wind]+ Filterwechsel ([[Lüftung]])";
    expect(stripJournalLineForDisplay(line)).toBe("Filterwechsel ([[Lüftung]])");
  });
});
