import { describe, expect, it } from "vitest";
import {
  buildTagebuchFeedBulletLines,
  findTagebuchFeedLine,
  stripLeadingTimeFromKurz,
  upsertTagebuchFeedLine,
} from "./appendTagebuchFeedLine";

describe("appendTagebuchFeedLine", () => {
  it("strips duplicate leading time from kurz", () => {
    expect(stripLeadingTimeFromKurz("10:00 Installation")).toBe("Installation");
  });

  it("builds metadata comment and bullet", () => {
    const lines = buildTagebuchFeedBulletLines({
      time: "14:30",
      kurz: "10:00 Warmwasser ausgefallen",
      metadata: { profile: "heizung", context: "" },
      suffixLinks: "([[Heizungs-Tagebuch]])",
    });
    expect(lines[0]).toContain("profile=heizung");
    expect(lines[1]).toBe("- 14:30 Warmwasser ausgefallen ([[Heizungs-Tagebuch]])");
  });

  it("upserts feed line inside the Tagebuch callout", () => {
    const input = [
      "## Tagebuch",
      "",
      "> [!tagebuch-ref] 01.07.2026",
      "> - 08:00 Aufstehen",
      "",
    ];
    const next = upsertTagebuchFeedLine(input, {
      time: "12:00",
      kurz: "Heizung geprüft",
      metadata: { profile: "heizung", context: "" },
      suffixLinks: "([[Heizungs-Tagebuch]])",
    });
    const joined = next.join("\n");
    expect(joined).toContain("profile=heizung");
    expect(joined).toContain("> - 12:00 Heizung geprüft");
    expect(joined).not.toMatch(/^- 12:00/m);

    const replaced = upsertTagebuchFeedLine(next, {
      time: "12:30",
      kurz: "Heizung OK",
      metadata: { profile: "heizung", context: "" },
      suffixLinks: "([[Heizungs-Tagebuch]])",
    });
    expect(replaced.filter((l) => l.includes("Heizung OK")).length).toBe(1);
    expect(replaced.filter((l) => l.includes("Heizung geprüft")).length).toBe(0);
  });

  it("inserts feed blocks in chronological order among journal bullets", () => {
    const input = [
      "## Tagebuch",
      "",
      "> [!tagebuch-ref] 02.07.2026",
      "> - 07:05 Aufstehen",
      "> - 11:40 Mittagessen",
      "> - 18:00 Spaziergang",
      ">",
      "> > [!blank-container|gallery]",
      "> > ![[photo.jpg]]",
      "",
    ];
    const next = upsertTagebuchFeedLine(input, {
      time: "12:15",
      kurz: "Lilien von Otto",
      metadata: { profile: "tagebuch", context: "Lilien von Otto" },
      suffixLinks: "",
    });
    const joined = next.join("\n");
    const aufstehen = joined.indexOf("07:05 Aufstehen");
    const mittag = joined.indexOf("11:40 Mittagessen");
    const lilien = joined.indexOf("12:15 Lilien von Otto");
    const spazier = joined.indexOf("18:00 Spaziergang");
    const gallery = joined.indexOf("[!blank-container");
    expect(aufstehen).toBeGreaterThan(-1);
    expect(mittag).toBeGreaterThan(aufstehen);
    expect(lilien).toBeGreaterThan(mittag);
    expect(spazier).toBeGreaterThan(lilien);
    expect(gallery).toBeGreaterThan(spazier);
  });

  it("moves orphan feed blocks into the callout", () => {
    const input = [
      "## Tagebuch",
      "",
      "> [!tagebuch-ref] 01.07.2026",
      "> - 08:00 Aufstehen",
      "<!-- udn-feed:profile=heizung -->",
      "- 12:56 Heizung test ([[Heizungs-Tagebuch]])",
      "",
    ];
    const next = upsertTagebuchFeedLine(input, {
      time: "13:00",
      kurz: "Heizung neu",
      metadata: { profile: "heizung", context: "" },
      suffixLinks: "([[Heizungs-Tagebuch]])",
    });
    const joined = next.join("\n");
    expect(joined).toContain("> - 13:00 Heizung neu");
    expect(joined).not.toContain("\n- 12:56");
    expect(joined).not.toMatch(/^<!-- udn-feed/m);
  });

  it("finds legacy Sonstiges feeds stored as profile=tagebuch with context", () => {
    const lines = [
      "## Tagebuch",
      "",
      "> [!tagebuch-ref] 02.07.2026",
      "> <!-- udn-feed:profile=tagebuch context=\"Lilien von Otto\" -->",
      "> - 12:15 Otto Lilien ausgegraben",
      "",
    ];
    const feed = findTagebuchFeedLine(lines, "sonstiges", "Lilien von Otto");
    expect(feed?.kurz).toBe("Otto Lilien ausgegraben");
    expect(feed?.time).toBe("12:15");
  });
});
