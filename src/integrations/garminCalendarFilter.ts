import type { CalendarItemLike } from "./calendarAppointments";

/** ICS UID written by garmin-sync cron (`garmin-{id}@denkarium`). */
export const GARMIN_ACTIVITY_UID_RE = /^garmin-[^@\s#]+@denkarium$/i;

const GARMIN_ACTIVITY_CATEGORIES = new Set(["wandern", "spaziergang"]);

const CALDAV_EVENT_PREFIX = "caldav:event:";
const CALDAV_TODO_PREFIX = "caldav:todo:";

/** Extract CalDAV UID from Universal Calendar item id or raw payload. */
export function caldavUidFromCalendarItem(item: { id: string; raw?: unknown }): string | null {
  const raw = item.raw as { uid?: string; categories?: string[] } | undefined;
  const fromRaw = raw?.uid?.trim();
  if (fromRaw) return fromRaw;

  let rest = "";
  if (item.id.startsWith(CALDAV_EVENT_PREFIX)) {
    rest = item.id.slice(CALDAV_EVENT_PREFIX.length);
  } else if (item.id.startsWith(CALDAV_TODO_PREFIX)) {
    rest = item.id.slice(CALDAV_TODO_PREFIX.length);
  } else {
    return null;
  }

  const uid = rest.split("#")[0]?.trim();
  return uid || null;
}

function categoriesFromCalendarItem(item: CalendarItemLike): string[] {
  const raw = item.raw as { categories?: string[] } | undefined;
  if (!Array.isArray(raw?.categories)) return [];
  return raw.categories.map((c) => String(c).trim()).filter(Boolean);
}

/**
 * Garmin activity VEVENTs (Aktivitäten-CalDAV) must not become generic `Termin:` lines —
 * they are imported via garminSync with Wandern/Spaziergang profile.
 */
export function isGarminActivityCalendarItem(item: CalendarItemLike): boolean {
  if (item.source !== "caldav_event" && item.source !== "caldav_todo") return false;

  const uid = caldavUidFromCalendarItem(item);
  if (uid && GARMIN_ACTIVITY_UID_RE.test(uid)) return true;

  return categoriesFromCalendarItem(item).some((c) => GARMIN_ACTIVITY_CATEGORIES.has(c.toLowerCase()));
}

export function garminCalendarSyncId(garminId: string): string {
  return `caldav:event:garmin-${garminId.trim()}@denkarium`;
}
