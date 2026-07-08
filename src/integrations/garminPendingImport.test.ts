import { describe, expect, it } from "vitest";
import { parseGarminPendingManifest } from "./garminPendingImport";

describe("garminPendingImport", () => {
  it("parses pending manifest activities", () => {
    const manifest = parseGarminPendingManifest(
      JSON.stringify({
        activities: [
          {
            garminId: "99",
            date: "2026-07-07",
            startTime: "11:02",
            title: "Heidküppel",
            profile: "spaziergang",
            gpxPath: "Calendar/Anhänge/GPX/2026-07-07.gpx",
            distanceKm: 4.2,
            durationSec: 3720,
          },
        ],
      }),
    );
    expect(manifest.activities).toHaveLength(1);
    expect(manifest.activities[0]?.garminId).toBe("99");
    expect(manifest.activities[0]?.profile).toBe("spaziergang");
  });

  it("skips invalid activity rows", () => {
    const manifest = parseGarminPendingManifest(
      JSON.stringify({
        activities: [{ garminId: "1", profile: "running" }, { garminId: "2" }],
      }),
    );
    expect(manifest.activities).toHaveLength(0);
  });
});
