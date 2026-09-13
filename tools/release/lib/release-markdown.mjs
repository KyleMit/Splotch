// Markdown -> HTML for the Svelte components generated from releases/*.md.
//
// Release notes are written in one narrow vocabulary — level-2/3 section
// headings, unordered lists, short paragraphs, and inline emphasis, code, and
// links — which is the same subset gen-release-notes.mjs's toPlainText renders
// for the store changelogs. This renders that subset and REFUSES everything
// else: a general Markdown parser silently accepts a table or a fenced block
// and ships whatever it makes of it, where a release artifact is generated once
// per cut and read by every user, so an unimplemented construct is worth a
// failed build rather than a surprise in the What's New pane.

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
// A bare `&` escapes, one already opening a character reference does not, so
// text an author wrote as `&amp;` survives a round trip instead of doubling.
const NEEDS_ESCAPE = /[<>"']|&(?!#\d{1,7};|#[Xx][\da-fA-F]{1,6};|\w+;)/g;

// Constructs this renderer does not implement, each with the name to report.
// Matched before anything else consumes the line, so they fail rather than
// falling through to the paragraph arm and rendering as literal prose.
const UNSUPPORTED_BLOCKS = [
  [/^\s*```/, 'a fenced code block'],
  [/^\s*>/, 'a blockquote'],
  [/^\s*\d+[.)]\s/, 'an ordered list'],
  [/^\s*\|/, 'a table'],
  [/^\s+[*-]\s/, 'a nested list'],
  [/^\s*!\[/, 'an image'],
  [/^\s*<[a-zA-Z/]/, 'raw HTML'],
  [/^\s*(?:[-*_]\s*){3,}$/, 'a horizontal rule'],
];

const HEADING = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM = /^[*-]\s+(.*)$/;
// Code spans and links are lifted out whole before emphasis runs, so a `*` or
// `_` inside either is content rather than a delimiter.
const INLINE_SPANS = /(`[^`]+`|\[[^\]]+\]\([^)\s]+\))/;
const CODE_SPAN = /^`([^`]+)`$/;
const LINK = /^\[([^\]]+)\]\(([^)\s]+)\)$/;
const STRONG = /\*\*([^*]+)\*\*/g;
// An opening `*` may not be followed by whitespace nor a closing one preceded
// by it — CommonMark's flanking rule — or a pair of lone asterisks in prose
// ("5 * 3 * 2") turns the text between them into an <em>.
const STAR_EMPHASIS = /\*(?!\s)([^*]+?)(?<!\s)\*/g;
// Underscore emphasis needs a non-word boundary on both sides, or every
// snake_case identifier in a release note turns into an <em>.
const UNDERSCORE_EMPHASIS = /(?<![\w*])_([^_]+)_(?![\w*])/g;

function escapeText(text) {
  return text.replace(NEEDS_ESCAPE, (character) => HTML_ESCAPES[character]);
}

function renderEmphasis(escaped) {
  return escaped
    .replace(STRONG, '<strong>$1</strong>')
    .replace(STAR_EMPHASIS, '<em>$1</em>')
    .replace(UNDERSCORE_EMPHASIS, '<em>$1</em>');
}

function renderInline(markdown) {
  return markdown
    .split(INLINE_SPANS)
    .map((part) => {
      const code = CODE_SPAN.exec(part);
      if (code) return `<code>${escapeText(code[1])}</code>`;
      const link = LINK.exec(part);
      if (link) {
        return `<a href="${escapeText(link[2])}">${renderEmphasis(escapeText(link[1]))}</a>`;
      }
      return renderEmphasis(escapeText(part));
    })
    .join('');
}

function rejectUnsupported(line) {
  for (const [pattern, construct] of UNSUPPORTED_BLOCKS) {
    if (pattern.test(line)) {
      throw new Error(
        `Release notes contain ${construct}, which the release Markdown renderer ` +
          `does not implement: ${line.trim()}`
      );
    }
  }
}

// A list item's text continues onto any following line that is neither blank
// nor the start of the next item — the indent is layout, not content.
function takeListItem(lines, start) {
  const parts = [LIST_ITEM.exec(lines[start])[1]];
  let index = start + 1;
  while (index < lines.length && lines[index].trim() && !LIST_ITEM.test(lines[index])) {
    if (HEADING.test(lines[index])) break;
    rejectUnsupported(lines[index]);
    parts.push(lines[index].trim());
    index += 1;
  }
  return { text: parts.join('\n'), next: index };
}

function takeParagraph(lines, start) {
  const parts = [];
  let index = start;
  while (index < lines.length && lines[index].trim()) {
    if (HEADING.test(lines[index]) || LIST_ITEM.test(lines[index])) break;
    rejectUnsupported(lines[index]);
    parts.push(lines[index].trim());
    index += 1;
  }
  return { text: parts.join('\n'), next: index };
}

/**
 * Render one release-note body (or one `##` section of it) to the HTML the
 * generated Svelte components embed. Blocks are emitted one per line, each
 * newline-terminated, and the caller re-indents.
 */
export function renderReleaseMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    rejectUnsupported(line);

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      index += 1;
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const items = [];
      while (index < lines.length && LIST_ITEM.test(lines[index])) {
        const item = takeListItem(lines, index);
        items.push(`<li>${renderInline(item.text)}</li>`);
        index = item.next;
      }
      blocks.push(`<ul>\n${items.join('\n')}\n</ul>`);
      continue;
    }

    const paragraph = takeParagraph(lines, index);
    blocks.push(`<p>${renderInline(paragraph.text)}</p>`);
    index = paragraph.next;
  }

  return blocks.map((block) => `${block}\n`).join('');
}
