import type { TrackMatch } from "./gpxImport";
import { formatTrackSummary } from "./gpxImport";

export type TrackPickOption = {
  track: TrackMatch | null;
  label: string;
  hint?: string;
};

export function trackPickOptionsForDay(
  dayTracks: TrackMatch[],
  otherTracks: TrackMatch[],
): TrackPickOption[] {
  const options: TrackPickOption[] = [];
  for (const track of dayTracks) {
    options.push({
      track,
      label: track.name,
      hint: `Heute · ${formatTrackSummary(track)}`,
    });
  }
  for (const track of otherTracks) {
    options.push({
      track,
      label: track.name,
      hint: track.path,
    });
  }
  options.push({ track: null, label: "Kein Track" });
  return options;
}
