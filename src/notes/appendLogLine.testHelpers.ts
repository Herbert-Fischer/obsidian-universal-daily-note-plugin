export function buildLogLineForTest(text: string, time: string, linkBase?: string): string {
  const trimmed = text.trim();
  let linkPart = "";
  if (linkBase) linkPart = ` [[${linkBase}]]`;
  return `- ${time} ${trimmed}${linkPart}`;
}

export function findInsertIndexForTest(lines: string[], headingPath: string | null): number {
  if (!headingPath?.trim()) return lines.length;
  const target = headingPath.trim().toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i]?.match(/^#{1,6}\s+(.+)$/);
    if (m && m[1]?.trim().toLowerCase() === target) {
      let j = i + 1;
      while (j < lines.length && !/^#{1,6}\s+/.test(lines[j] ?? "")) j++;
      return j;
    }
  }
  return lines.length;
}
