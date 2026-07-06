/** Strip leading `>` callout prefixes without trimming markdown content. */
export function stripCalloutPrefixRaw(line: string): string {
  let rest = line;
  while (rest.startsWith(">")) {
    rest = rest.slice(1);
    if (rest.startsWith(" ")) rest = rest.slice(1);
  }
  return rest;
}

/** Convert composer detail markdown to callout body lines (`> …`). */
export function detailToCalloutProseLines(detail: string): string[] {
  if (!detail) return [];
  return detail.split("\n").map((line) => (line.length === 0 ? ">" : `> ${line}`));
}

/** Parse callout body lines back to composer detail markdown. */
export function calloutProseLinesToDetail(lines: string[]): string {
  const parts: string[] = [];
  for (const line of lines) {
    if (!line.trim().startsWith(">")) continue;
    parts.push(stripCalloutPrefixRaw(line));
  }
  return parts.join("\n");
}
