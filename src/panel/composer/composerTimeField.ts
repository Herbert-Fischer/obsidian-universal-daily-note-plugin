const TIME_RE = /^(\d{1,2}):(\d{1,2})$/;

/** Normalize journal HH:mm for HTML time inputs and consistent storage. */
export function normalizeComposerTimeValue(value: string): string {
  const match = value.trim().match(TIME_RE);
  if (!match) return "";
  const hours = Math.min(23, Math.max(0, Number.parseInt(match[1], 10)));
  const minutes = Math.min(59, Math.max(0, Number.parseInt(match[2], 10)));
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function composerTimeInputType(isMobile: boolean): "time" | "text" {
  return isMobile ? "time" : "text";
}

/** Opens the native time picker on mobile when supported (requires user gesture / focus). */
export function openComposerTimePicker(input: HTMLInputElement): void {
  if (input.type !== "time") return;
  try {
    input.showPicker?.();
  } catch {
    /* unsupported or blocked */
  }
}

export function composerTimeInputValue(value: string, isMobile: boolean): string {
  return isMobile ? normalizeComposerTimeValue(value) : value;
}
