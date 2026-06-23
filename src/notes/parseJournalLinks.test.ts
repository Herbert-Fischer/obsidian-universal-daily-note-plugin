import { describe, expect, it } from "vitest";
import { parseJournalLinks } from "./parseJournalLinks";

describe("parseJournalLinks", () => {
  it("parses wikilinks", () => {
    expect(parseJournalLinks("Besuch [[Mona Buchmann]]")).toEqual([
      { kind: "text", value: "Besuch " },
      { kind: "wiki", dest: "Mona Buchmann", label: "Mona Buchmann" },
    ]);
  });

  it("parses markdown URL links", () => {
    expect(
      parseJournalLinks("[Waldgasthof Wachtküppel](https://www.wachtkueppel.de/)"),
    ).toEqual([
      {
        kind: "url",
        label: "Waldgasthof Wachtküppel",
        href: "https://www.wachtkueppel.de/",
      },
    ]);
  });

  it("parses mixed wikilink and markdown URL", () => {
    expect(parseJournalLinks("[[Note]] und [Web](https://example.com)")).toEqual([
      { kind: "wiki", dest: "Note", label: "Note" },
      { kind: "text", value: " und " },
      { kind: "url", href: "https://example.com", label: "Web" },
    ]);
  });

  it("returns plain text when no links", () => {
    expect(parseJournalLinks("07:10 Aufstehen")).toEqual([{ kind: "text", value: "07:10 Aufstehen" }]);
  });
});
