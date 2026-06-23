export function normalizeLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function addLocalDays(d: Date, delta: number): Date {
  const out = normalizeLocalDay(d);
  out.setDate(out.getDate() + delta);
  return out;
}

export function formatTimeLocal(d: Date, pattern: string): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return pattern.replace("HH", hh).replace("mm", mm);
}
