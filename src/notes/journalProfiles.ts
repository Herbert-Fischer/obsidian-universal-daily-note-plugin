import type { FeedProfile } from "./feedMetadata";

export type JournalProfileKind = "list" | "detail";

export type JournalProfileDef = {
  id: FeedProfile;
  /** Composer / ## section label */
  label: string;
  kind: JournalProfileKind;
  hubLink: string;
  /** Wiki-link suffix appended to Tagebuch feed bullets */
  feedSuffix: string;
  photosFolder: string;
  maxPhotos: number;
};

export const JOURNAL_PROFILES: JournalProfileDef[] = [
  {
    id: "heizung",
    label: "Heizung",
    kind: "detail",
    hubLink: "Heizungs-Tagebuch",
    feedSuffix: "([[EFH Hettenhausen]]) ([[Heizung]]) ([[Heizungs-Tagebuch]]) ([[Operation Warmduscher]])",
    photosFolder: "Atlas/Immobilien/EFH Hettenhausen/Anhänge/Heizung/Probleme",
    maxPhotos: 6,
  },
  {
    id: "lueftung",
    label: "Lüftung",
    kind: "detail",
    hubLink: "Lüftungs-Tagebuch",
    feedSuffix: "([[EFH Hettenhausen]] · [[Lüftungs-Tagebuch]])",
    photosFolder: "Atlas/Immobilien/EFH Hettenhausen/Anhänge/Lueftung/Wartungsprotokoll Fotos",
    maxPhotos: 6,
  },
  {
    id: "reisen",
    label: "Reisen",
    kind: "list",
    hubLink: "Reise-Tagebuch",
    feedSuffix: "([[Reise-Tagebuch]])",
    photosFolder: "Calendar/Anhänge/Bilder",
    maxPhotos: 3,
  },
  {
    id: "wandern",
    label: "Wandern",
    kind: "detail",
    hubLink: "Wandern-Tagebuch",
    feedSuffix: "([[Wandern-Tagebuch]])",
    photosFolder: "Calendar/Anhänge/Bilder",
    maxPhotos: 3,
  },
];

/** ## headings that share a Tagebuch feed profile (Reisen, Wandern, …). */
export const FEED_PROFILE_SECTION_LABELS = JOURNAL_PROFILES.map((p) => p.label);

export function isFeedProfileSectionHeading(heading: string): boolean {
  return journalProfileForHeading(heading) != null;
}

export function journalProfileForHeading(heading: string): JournalProfileDef | null {
  const key = heading.trim().toLowerCase();
  return JOURNAL_PROFILES.find((p) => p.label.toLowerCase() === key) ?? null;
}

export function journalProfileById(id: FeedProfile): JournalProfileDef | null {
  return JOURNAL_PROFILES.find((p) => p.id === id) ?? null;
}

export function lueftungPhotosFolderForYear(baseFolder: string, year: number): string {
  const base = baseFolder.trim().replace(/\/+$/, "");
  return `${base}/${year}`;
}
