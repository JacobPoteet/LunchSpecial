// The tiny markdown subset announcement bodies are written in.
//
// It parses to TOKENS, not HTML. Nothing here ever produces a string that gets
// injected into the page — the client turns these tokens into React elements
// (src/game/Markdown.tsx), so there is no innerHTML anywhere in the path and
// therefore nothing to sanitize. An unrecognised character sequence is simply
// text; malformed emphasis stays on screen as the asterisks the author typed.
//
// Supported, deliberately: **bold**, *italic* / _italic_, [label](url).
// Not supported: headings (the modal has its own header), images, raw HTML,
// lists, code. The diner's voice is short prose, and every extra construct is
// another thing that can look wrong inside a 1950s receipt card.

export type Span =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "em"; text: string }
  | { type: "link"; text: string; href: string };

/** A paragraph, split into its lines — a single newline renders as a break. */
export interface Paragraph {
  lines: Span[][];
}

// Alternation order matters: **bold** must be tried before *italic*, or the
// leading `**` would match as an empty emphasis run.
const INLINE = /\[([^\]\n]+)\]\(([^\s)]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|_([^_\n]+)_/g;

/**
 * Accept only links that can't turn into script execution: absolute http(s), or
 * a same-site path. Everything else (javascript:, data:, protocol-relative
 * //host) returns null and the link degrades to its own label as plain text —
 * visible, harmless, and obvious to whoever wrote it.
 */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^https?:\/\/[^/\s]/i.test(href)) return href;
  if (href === "/" || /^\/[^/]/.test(href)) return href;
  return null;
}

/** Parse one line of inline markup into spans. */
function parseLine(line: string): Span[] {
  const spans: Span[] = [];
  let cursor = 0;
  INLINE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE.exec(line)) !== null) {
    if (match.index > cursor) spans.push({ type: "text", text: line.slice(cursor, match.index) });
    const [, linkText, linkHref, strong, star, underscore] = match;
    if (linkText !== undefined) {
      const href = safeHref(linkHref);
      spans.push(href ? { type: "link", text: linkText, href } : { type: "text", text: linkText });
    } else if (strong !== undefined) {
      spans.push({ type: "strong", text: strong });
    } else {
      spans.push({ type: "em", text: (star ?? underscore) as string });
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < line.length) spans.push({ type: "text", text: line.slice(cursor) });
  return spans;
}

/**
 * Parse an announcement body. Blank lines separate paragraphs; a single newline
 * is a line break inside one. Returns an empty array for an empty body.
 */
export function parseMarkdown(source: string): Paragraph[] {
  return source
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => ({ lines: block.split("\n").map(parseLine) }));
}

/**
 * The body as flat text — no markup, paragraphs joined by a space. Used for the
 * one-line summary in the admin list, where markup would be noise.
 */
export function markdownToText(source: string): string {
  return parseMarkdown(source)
    .flatMap((p) => p.lines.map((spans) => spans.map((s) => s.text).join("")))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
