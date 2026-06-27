import { describe, expect, it } from "vitest";
import {
  buildPhotoCollageMarkdown,
  buildTrack3dBlock,
  calloutPrefixBeforePlaceholder,
  DEFAULT_WANDERN_LAYOUT_TEMPLATE,
  indentMarkdownBlock,
  parseWandernMetaLine,
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

  it("buildPhotoCollageMarkdown joins gallery embeds on one line", () => {
    const one = buildPhotoCollageMarkdown(["Calendar/a.jpg"], "> > > ");
    expect(one).toBe("> > > ![[Calendar/a.jpg]]");

    const many = buildPhotoCollageMarkdown(
      ["![[a.jpg]]", "![[b.jpg]]", "![[c.jpg]]"],
      "> > > ",
    );
    expect(many).toBe("> > > ![[a.jpg]] ![[b.jpg]] ![[c.jpg]]");
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
    expect(out).toContain("[!blank-container|no-margin gallery]");
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
    expect(out).not.toMatch(/\npath: Calendar\/Tracks/);
  });
});
