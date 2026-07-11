import { describe, expect, it } from "vitest";
import { parseWalkEntryMetasFromContent } from "./walkCalloutStatsEnrichment";

describe("parseWalkEntryMetasFromContent", () => {
  it("reads kurz from spaziergang entry meta", () => {
    const content = `## Spaziergang
> [!person-walking]+ Spaziergang: Heidküppel
>
> > [!blank|wide-60]
> > > \`\`\`udn-track-3d
> > > path: Calendar/a.gpx
> > > \`\`\`
>
<!-- udn-spaziergang-entry: {"titel":"Spaziergang: Heidküppel","kurz":"2,28 km · 46 min","beschreibung":"","trackPath":"Calendar/a.gpx","entryId":"x1"} -->
`;
    const metas = parseWalkEntryMetasFromContent(content);
    expect(metas).toHaveLength(1);
    expect(metas[0]?.kurz).toBe("2,28 km · 46 min");
    expect(metas[0]?.titel).toContain("Heidküppel");
  });
});
