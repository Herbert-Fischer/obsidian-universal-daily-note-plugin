/** WMO weather codes (Open-Meteo) → German label + emoji. */
export function weatherCodeLabel(code: number): { label: string; emoji: string } {
  if (code === 0) return { label: "klar", emoji: "☀️" };
  if (code <= 3) return { label: "bewölkt", emoji: code === 1 ? "🌤️" : code === 2 ? "⛅" : "☁️" };
  if (code <= 48) return { label: "Nebel", emoji: "🌫️" };
  if (code <= 57) return { label: "Nieselregen", emoji: "🌦️" };
  if (code <= 67) return { label: "Regen", emoji: "🌧️" };
  if (code <= 77) return { label: "Schnee", emoji: "🌨️" };
  if (code <= 82) return { label: "Schauer", emoji: "🌧️" };
  if (code <= 86) return { label: "Schneeschauer", emoji: "🌨️" };
  if (code <= 99) return { label: "Gewitter", emoji: "⛈️" };
  return { label: "unbekannt", emoji: "🌡️" };
}
