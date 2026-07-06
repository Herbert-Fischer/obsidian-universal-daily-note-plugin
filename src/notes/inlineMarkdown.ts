export type InlineMarkdownSegment =
  | { kind: "text"; value: string }
  | { kind: "strong"; value: string }
  | { kind: "em"; value: string }
  | { kind: "del"; value: string }
  | { kind: "code"; value: string }
  | { kind: "mark"; value: string };

type InlineMatch = {
  index: number;
  length: number;
  kind: Exclude<InlineMarkdownSegment["kind"], "text">;
  inner: string;
};

const INLINE_RULES: { kind: InlineMatch["kind"]; re: RegExp }[] = [
  { kind: "code", re: /`([^`\n]+)`/ },
  { kind: "strong", re: /\*\*([^*\n]+)\*\*/ },
  { kind: "strong", re: /__([^_\n]+)__/ },
  { kind: "del", re: /~~([^~\n]+)~~/ },
  { kind: "mark", re: /==([^=\n]+)==/ },
  { kind: "em", re: /(?<!\*)\*([^*\n]+)\*(?!\*)/ },
  { kind: "em", re: /(?<![\w])_([^_\n]+)_(?![\w])/ },
];

function findEarliestInlineMatch(text: string): InlineMatch | null {
  let best: InlineMatch | null = null;
  for (const { kind, re } of INLINE_RULES) {
    const m = re.exec(text);
    if (!m?.[1]) continue;
    const index = m.index ?? 0;
    if (!best || index < best.index) {
      best = { index, length: m[0].length, kind, inner: m[1] };
    }
  }
  return best;
}

/** Parse Obsidian-style inline markdown in outline/composer display text. */
export function parseInlineMarkdown(text: string): InlineMarkdownSegment[] {
  if (!text) return [{ kind: "text", value: "" }];

  const out: InlineMarkdownSegment[] = [];
  let rest = text;

  while (rest.length > 0) {
    const match = findEarliestInlineMatch(rest);
    if (!match) {
      out.push({ kind: "text", value: rest });
      break;
    }
    if (match.length <= 0) {
      out.push({ kind: "text", value: rest });
      break;
    }
    if (match.index > 0) {
      out.push({ kind: "text", value: rest.slice(0, match.index) });
    }
    if (match.kind === "code") {
      out.push({ kind: "code", value: match.inner });
    } else {
      out.push({ kind: match.kind, value: match.inner });
    }
    const nextRest = rest.slice(match.index + match.length);
    if (nextRest === rest) {
      out.push({ kind: "text", value: rest });
      break;
    }
    rest = nextRest;
  }

  return out.length > 0 ? out : [{ kind: "text", value: text }];
}

export function inlineMarkdownHasMarkup(text: string): boolean {
  return parseInlineMarkdown(text).some((seg) => seg.kind !== "text");
}
