import { describe, expect, it } from "vitest";
import {
  buildWandernAttachmentVaultPath,
  buildWandernTrackVaultPath,
  folderFromCalloutTitel,
  gpxFileNameFromCalloutTitel,
  slugFromWandernTitel,
} from "./attachJournalMedia";

describe("attachJournalMedia wandern", () => {
  it("folderFromCalloutTitel builds vault folder from callout title", () => {
    expect(folderFromCalloutTitel("Wandern: Bläsis Mühle")).toBe("Wandern_Bläsis_Mühle");
    expect(folderFromCalloutTitel("Wandern · Rhön")).toBe("Wandern_Rhön");
  });

  it("slugFromWandernTitel slugifies folder name", () => {
    expect(slugFromWandernTitel("Wandern: Bläsis Mühle")).toBe("wandern_blasis_muhle");
  });

  it("buildWandernAttachmentVaultPath uses Calendar/Anhänge/Bilder/<titel>/NN.ext", () => {
    const path = buildWandernAttachmentVaultPath(
      0,
      "pxl_20260614_082931709portrait.jpg",
      "Wandern: Bläsis Mühle",
    );
    expect(path).toBe("Calendar/Anhänge/Bilder/Wandern_Bläsis_Mühle/01.jpg");
  });

  it("buildWandernTrackVaultPath uses Calendar/Anhänge/GPX/<Callout-Titel>.gpx", () => {
    expect(gpxFileNameFromCalloutTitel("Wandern: Bläsis Mühle")).toBe("Wandern Bläsis Mühle.gpx");
    expect(buildWandernTrackVaultPath("Wandern: Bläsis Mühle")).toBe(
      "Calendar/Anhänge/GPX/Wandern Bläsis Mühle.gpx",
    );
  });
});
