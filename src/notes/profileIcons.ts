import type { FeedProfile } from "./feedMetadata";

const PROFILE_ICON_NAMES: Partial<Record<FeedProfile, string>> = {
  reisen: "compass",
  wandern: "mountain",
  spaziergang: "person-walking",
  heizung: "flame",
  lueftung: "wind",
  gedanken: "lightbulb",
  sonstiges: "more-horizontal",
};

/** Lucide icon names for profile chips. */
export function profileIconName(profile: FeedProfile | undefined): string {
  if (!profile || profile === "tagebuch") return "";
  return PROFILE_ICON_NAMES[profile] ?? "";
}

const SVG_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';

export const PROFILE_ICON_SVG: Record<string, string> = {
  circle: `${SVG_OPEN}<circle cx="12" cy="12" r="9"/></svg>`,
  compass: `${SVG_OPEN}<circle cx="12" cy="12" r="9"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/></svg>`,
  mountain: `${SVG_OPEN}<path d="m8 4 4 7 5-4.5 5 13H2L8 4z"/></svg>`,
  footprints: `${SVG_OPEN}<circle cx="8.5" cy="7.5" r="1.35"/><circle cx="15.5" cy="9" r="1.35"/><path d="m7.5 11.5 1 5.5"/><path d="m14.5 12.5 1 4.5"/><path d="M6 20v-1.5"/><path d="M15 20v-1.5"/></svg>`,
  "person-walking": `${SVG_OPEN}<circle cx="12" cy="5" r="1.75"/><path d="m11 8.5 1.2 4.2-1.8 1.4-.7 4.4"/><path d="m12.2 12.7 2.1 6.3"/><path d="m9.4 14.1-1.5 5.4"/></svg>`,
  flame: `${SVG_OPEN}<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  wind: `${SVG_OPEN}<path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>`,
  lightbulb: `${SVG_OPEN}<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
  "more-horizontal": `${SVG_OPEN}<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`,
};

/** Render a profile chip icon with inline SVG (reliable in plugin + Dataview). */
export function renderProfileIcon(container: HTMLElement, iconName: string): void {
  const name = iconName.trim() || "circle";
  const svg = PROFILE_ICON_SVG[name] ?? PROFILE_ICON_SVG.circle ?? "";
  container.innerHTML = "";
  container.classList.remove("udn-profileBubbleIcon");
  const iconWrap = container.appendChild(document.createElement("span"));
  iconWrap.className = "udn-profileBubbleIcon";
  iconWrap.innerHTML = svg;
}
