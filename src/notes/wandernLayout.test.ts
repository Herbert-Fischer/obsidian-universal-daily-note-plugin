import { describe, expect, it } from "vitest";
import {
  buildPhotoCollageMarkdown,
  buildTrack3dBlock,
  calloutPrefixBeforePlaceholder,
  DEFAULT_WANDERN_LAYOUT_TEMPLATE,
  indentMarkdownBlock,
  parseWandernMetaLine,
  parseWandernFromSectionLines,
  renderWandernTemplate,
  wandernMetaComment,
  wandernTimelineTextFromMeta,
} from "./wandernLayout";

describe("wandernLayout", () => {
  it("renders template placeholders", () => {
    const out = renderWandernTemplate({
      titel: "Wandern · Rhön",
      kurz: "Drei Gipfel",
      beschreibung: "Langer Tag",
      track: {
        path: "Calendar/Tracks/2026-06-24.gpx",
        name: "2026-06-24.gpx",
        distanceKm: 14.2,
        durationSec: 3600,
        startLabel: null,
        endLabel: null,
      },
      photos: ["Calendar/Attachments/a.jpg"],
      date: new Date(2026, 5, 24),
      layout: {
        template: "> [!mountain]+ {{titel}}\n\n{{kurz}}\n{{track3d}}\n{{foto1}}",
        maxPhotos: 3,
        track3dEnabled: true,
        track3dHeight: 200,
        track3dElevationExaggeration: 4,
      },
    });
    expect(out).toContain("Wandern · Rhön");
    expect(out).toContain("Drei Gipfel");
    expect(out).toContain("```udn-track-3d");
    expect(out).toContain("![[Calendar/Attachments/a.jpg]]");
  });

  it("uses default template when settings template empty", () => {
    const out = renderWandernTemplate({
      titel: "Wandern",
      kurz: "Test",
      beschreibung: "",
      track: null,
      photos: [],
      date: new Date(2026, 0, 1),
      layout: {
        template: "",
        maxPhotos: 3,
        track3dEnabled: false,
        track3dHeight: 400,
        track3dElevationExaggeration: 4,
      },
    });
    expect(out.length).toBeGreaterThan(DEFAULT_WANDERN_LAYOUT_TEMPLATE.length / 2);
    expect(out).toContain("[!multi-column]");
    expect(out).toContain("[!blank|wide-60]");
    expect(out).not.toContain("[!grid-card");
  });

  it("round-trips metadata comment", () => {
    const meta = {
      titel: "Wandern · Test",
      kurz: "Kurz",
      beschreibung: "Lang",
      track: "10 km",
      trackPath: "t.gpx",
      fotos: ["![[a.jpg]]"],
    };
    const line = wandernMetaComment(meta);
    const parsed = parseWandernMetaLine(line);
    expect(parsed?.kurz).toBe("Kurz");
    expect(wandernTimelineTextFromMeta(meta)).toBe("Kurzbeschreibung: Kurz");
  });

  it("buildTrack3dBlock includes path and exaggeration", () => {
    expect(buildTrack3dBlock("Calendar/Tracks/x.gpx", 400, "", 5)).toContain("path: Calendar/Tracks/x.gpx");
    expect(buildTrack3dBlock("Calendar/Tracks/x.gpx", 400, "", 5)).toContain("exaggeration: 5");
  });

  it("indentMarkdownBlock prefixes every line", () => {
    const block = indentMarkdownBlock("```test\nline\n```", "> > ");
    expect(block).toBe("> > ```test\n> > line\n> > ```");
  });

  it("buildTrack3dBlock indents for nested callouts", () => {
    const block = buildTrack3dBlock("Calendar/Tracks/x.gpx", 400, "> > ", 4);
    expect(block).toContain("> > ```udn-track-3d");
    expect(block).toContain("> > path: Calendar/Tracks/x.gpx");
    expect(block).toContain("> > ```");
  });

  it("calloutPrefixBeforePlaceholder reads blockquote depth", () => {
    const tpl = "> [!x]\n> > {{track3d}}\n> > {{fotos}}";
    expect(calloutPrefixBeforePlaceholder(tpl, "track3d")).toBe("> > ");
    expect(calloutPrefixBeforePlaceholder(tpl, "fotos")).toBe("> > ");
  });

  it("buildPhotoCollageMarkdown builds gallery callout block", () => {
    const one = buildPhotoCollageMarkdown(["Calendar/a.jpg"], "> > > ");
    expect(one).toContain("[!blank-container|no-margin gallery gallery-row]");
    expect(one).toContain("> > > ![[Calendar/a.jpg]]");

    const many = buildPhotoCollageMarkdown(["![[a.jpg]]", "![[b.jpg]]", "![[c.jpg]]"], "> > > ");
    expect(many).toContain("gallery-row");
    expect(many).toContain("> > > ![[a.jpg]] ![[b.jpg]] ![[c.jpg]]");
    expect(many).not.toContain("[!grid");
  });

  it("renderWandernTemplate uses denkarium multi-column layout", () => {
    const out = renderWandernTemplate({
      titel: "Wandern: Testtour",
      kurz: "Kurz",
      beschreibung: "Lang",
      track: null,
      photos: [
        "Calendar/Attachments/a.jpg",
        "Calendar/Attachments/b.jpg",
        "Calendar/Attachments/c.jpg",
      ],
      date: new Date(2026, 0, 1),
      layout: {
        template: DEFAULT_WANDERN_LAYOUT_TEMPLATE,
        maxPhotos: 3,
        track3dEnabled: false,
        track3dHeight: 400,
        track3dElevationExaggeration: 4,
      },
    });
    expect(out).toContain("> [!mountain]+ Wandern: Testtour");
    expect(out).toContain("[!blank-container|no-margin gallery");
    expect(out).toContain("gallery-row");
    expect(out).toContain("> > > ![[Calendar/Attachments/a.jpg]] ![[Calendar/Attachments/b.jpg]] ![[Calendar/Attachments/c.jpg]]");
    expect(out).not.toContain("[!grid-card");
    expect(out).not.toContain("[!grid-item");
  });

  it("renderWandernTemplate indents track3d inside nested callout", () => {
    const out = renderWandernTemplate({
      titel: "Wandern",
      kurz: "Test",
      beschreibung: "",
      track: {
        path: "Calendar/Tracks/x.gpx",
        name: "x.gpx",
        distanceKm: 1,
        durationSec: 60,
        startLabel: null,
        endLabel: null,
      },
      photos: [],
      date: new Date(2026, 0, 1),
      layout: {
        template: DEFAULT_WANDERN_LAYOUT_TEMPLATE,
        maxPhotos: 3,
        track3dEnabled: true,
        track3dHeight: 400,
        track3dElevationExaggeration: 4,
      },
    });
    const trackBlock = out.split("```udn-track-3d")[1]?.split("```")[0] ?? "";
    for (const line of trackBlock.split("\n")) {
      if (line.trim().length === 0) continue;
      expect(line.startsWith("> > > ")).toBe(true);
    }
    expect(out).not.toMatch(/\n> > > > /);
  });

  it("renderWandernTemplate keeps multi-column siblings at correct blockquote depth", () => {
    const out = renderWandernTemplate({
      titel: "Wandern: Testtour",
      kurz: "Kurz",
      beschreibung: "Lang",
      track: {
        path: "Calendar/Tracks/x.gpx",
        name: "x.gpx",
        distanceKm: 1,
        durationSec: 60,
        startLabel: null,
        endLabel: null,
      },
      photos: ["Calendar/Attachments/a.jpg"],
      date: new Date(2026, 0, 1),
      layout: {
        template: DEFAULT_WANDERN_LAYOUT_TEMPLATE,
        maxPhotos: 3,
        track3dEnabled: true,
        track3dHeight: 400,
        track3dElevationExaggeration: 4,
      },
    });
    expect(out).not.toMatch(/\n>\n> > > \[!blank-container/);
    expect(out).toMatch(/\n> > > \[!blank-container\|no-margin gallery gallery-row/);
    expect(out).toMatch(/\n> > > Lang/);
    expect(out).not.toMatch(/\n> > > \*\*Kurz:\*\*/);
    expect(out).not.toMatch(/\n> >\s*$/);
  });

  it("renderWandernTemplate omits empty gallery callout", () => {
    const out = renderWandernTemplate({
      titel: "Wandern",
      kurz: "Test",
      beschreibung: "",
      track: null,
      photos: [],
      date: new Date(2026, 0, 1),
      layout: {
        template: DEFAULT_WANDERN_LAYOUT_TEMPLATE,
        maxPhotos: 3,
        track3dEnabled: false,
        track3dHeight: 400,
        track3dElevationExaggeration: 4,
      },
    });
    expect(out).not.toContain("[!blank-container");
    expect(out).not.toContain("{{fotos}}");
  });

  it("renderWandernTemplate indents multiline beschreibung", () => {
    const out = renderWandernTemplate({
      titel: "Wandern",
      kurz: "Kurz",
      beschreibung: "Zeile eins\nZeile zwei",
      track: null,
      photos: [],
      date: new Date(2026, 0, 1),
      layout: {
        template: "> [!mountain]+ {{titel}}\n> > {{beschreibung}}",
        maxPhotos: 3,
        track3dEnabled: false,
        track3dHeight: 400,
        track3dElevationExaggeration: 4,
      },
    });
    expect(out).toContain("> > Zeile eins");
    expect(out).toContain("> > Zeile zwei");
    expect(out).not.toMatch(/\nZeile zwei/);
  });

  it("parseWandernFromSectionLines reads callout body without metadata", () => {
    const parsed = parseWandernFromSectionLines(
      [
        "> [!mountain]+ Wandern: Bläsis Mühle",
        ">",
        "> > **Kurz:** Wanderung in Pfronten",
        "> > Erste Zeile",
        "> > Zweite Zeile",
        "> > ```udn-track-3d",
        "> > path: Calendar/Tracks/x.gpx",
        "> > ```",
        "> > ![[Calendar/Attachments/a.jpg]]",
      ],
      "Wandern",
    );
    expect(parsed?.titel).toBe("Wandern: Bläsis Mühle");
    expect(parsed?.kurz).toBe("Wanderung in Pfronten");
    expect(parsed?.beschreibung).toBe("Erste Zeile\nZweite Zeile");
    expect(parsed?.track?.path).toBe("Calendar/Tracks/x.gpx");
    expect(parsed?.photos).toEqual(["Calendar/Attachments/a.jpg"]);
  });
});
