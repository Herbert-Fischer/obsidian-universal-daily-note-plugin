import { describe, expect, it } from "vitest";
import {
  buildPhotoCollageMarkdown,
  buildTrack3dBlock,
  calloutPrefixBeforePlaceholder,
  DEFAULT_SPAZIERGANG_LAYOUT_TEMPLATE,
  indentMarkdownBlock,
  parseSpaziergangMetaLine,
  parseSpaziergangFromSectionLines,
  renderSpaziergangTemplate,
  spaziergangMetaComment,
  spaziergangTimelineTextFromMeta,
} from "./spaziergangLayout";

describe("spaziergangLayout", () => {
  it("renders template placeholders", () => {
    const out = renderSpaziergangTemplate({
      titel: "Spaziergang · Park",
      kurz: "Runde am See",
      beschreibung: "Schön",
      track: {
        path: "Calendar/Tracks/2026-06-24.gpx",
        name: "2026-06-24.gpx",
        distanceKm: 2.4,
        durationSec: 3600,
        startLabel: null,
        endLabel: null,
      },
      photos: ["Calendar/Attachments/a.jpg"],
      date: new Date(2026, 5, 24),
      layout: {
        template: "> [!person-walking]+ {{titel}}\n\n{{kurz}}\n{{track3d}}\n{{foto1}}",
        maxPhotos: 3,
        track3dEnabled: true,
        track3dHeight: 200,
        track3dElevationExaggeration: 4,
      },
    });
    expect(out).toContain("Spaziergang · Park");
    expect(out).toContain("Runde am See");
    expect(out).toContain("```udn-track-3d");
    expect(out).toContain("![[Calendar/Attachments/a.jpg]]");
  });

  it("uses default template when settings template empty", () => {
    const out = renderSpaziergangTemplate({
      titel: "Spaziergang",
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
    expect(out.length).toBeGreaterThan(DEFAULT_SPAZIERGANG_LAYOUT_TEMPLATE.length / 2);
    expect(out).toContain("[!multi-column]");
    expect(out).toContain("[!blank|wide-60]");
  });

  it("does not double-indent gallery block in default template", () => {
    const photoBlock = buildPhotoCollageMarkdown(["Calendar/Anhänge/Bilder/a.jpg"], "", "gallery-row");
    const out = renderSpaziergangTemplate({
      titel: "Spaziergang: Parkrunde",
      kurz: "",
      beschreibung: "Runde",
      track: null,
      photos: ["Calendar/Anhänge/Bilder/a.jpg"],
      date: new Date(2026, 6, 7),
      layout: {
        template: "",
        maxPhotos: 3,
        track3dEnabled: false,
        track3dHeight: 200,
        track3dElevationExaggeration: 4,
      },
      photoCollageMarkdown: photoBlock,
      layoutClass: "gallery-row",
    });
    expect(out).toContain("> > > [!blank-container|no-margin gallery gallery-row]");
    const galleryLine = out.split("\n").find((line) => line.includes("[!blank-container"));
    expect(galleryLine).toBeDefined();
    expect(galleryLine).toMatch(/^> > > \[!/);
    expect(galleryLine).not.toMatch(/^> > > > /);
  });

  it("round-trips metadata comment", () => {
    const meta = {
      titel: "Spaziergang · Test",
      kurz: "Kurz",
      beschreibung: "Lang",
      track: "2 km",
      trackPath: "t.gpx",
      fotos: ["![[a.jpg]]"],
    };
    const line = spaziergangMetaComment(meta);
    const parsed = parseSpaziergangMetaLine(line);
    expect(parsed?.kurz).toBe("Kurz");
    expect(spaziergangTimelineTextFromMeta(meta)).toBe("Kurzbeschreibung: Kurz");
  });

  it("buildTrack3dBlock includes path and exaggeration", () => {
    expect(buildTrack3dBlock("Calendar/Tracks/x.gpx", 400, "", 5)).toContain("path: Calendar/Tracks/x.gpx");
    expect(buildTrack3dBlock("Calendar/Tracks/x.gpx", 400, "", 5)).toContain("exaggeration: 5");
  });

  it("indentMarkdownBlock prefixes every line", () => {
    const block = indentMarkdownBlock("```test\nline\n```", "> > ");
    expect(block).toBe("> > ```test\n> > line\n> > ```");
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
  });

  it("parseSpaziergangFromSectionLines reads callout body without metadata", () => {
    const parsed = parseSpaziergangFromSectionLines(
      [
        "> [!person-walking]+ Spaziergang: Parkrunde",
        ">",
        "> > **Kurz:** Runde",
        "> > Erste Zeile",
        "> > Zweite Zeile",
        "> > ```udn-track-3d",
        "> > path: Calendar/Tracks/x.gpx",
        "> > ```",
        "> > ![[Calendar/Attachments/a.jpg]]",
      ],
      "Spaziergang",
    );
    expect(parsed?.titel).toContain("Spaziergang:");
    expect(parsed?.kurz).toBe("Runde");
    expect(parsed?.track?.path).toBe("Calendar/Tracks/x.gpx");
    expect(parsed?.photos.length).toBe(1);
  });
});

