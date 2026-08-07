import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// docs/COMPATIBILITY.md's API risk register is the document consulted before
// raising the browser floor or adding a modern web API, and its Where column is
// the whole reason to trust it: "this is the guard that makes the API safe
// below the floor". That column used to cite `file.ext:NNN`. A bare line pin
// has no redundancy — nothing reads it, nothing fails when the file moves — so
// the pins rotted together rather than one at a time where someone would
// notice, and several drifted so far that the cited file no longer contained
// the API at all. A reader who followed one landed somewhere the API does not
// appear and could not tell whether the row was stale or the guard was dropped.
//
// So the column now cites `path` → `marker`: a file under web/src/ plus a
// literal string that must appear in it — a symbol, selector, or call site that
// survives a refactor. This is the mechanical guard on that agreement, in the
// spirit of web/src/app.html.test.ts: delete the guard, rename the symbol, or
// move the API to another module and this fails, naming the row.
//
// It cannot police what the column chooses to cite, which is why the column
// cites guards rather than every use site (see the doc's "Maintaining this").
// An exhaustive file list is inventory: a missing entry is invisible to this
// test, so the list acquires an air of completeness nothing maintains.
const repoRoot = join(import.meta.dirname, '..', '..');
const registerDoc = join(repoRoot, 'docs', 'COMPATIBILITY.md');
const sourceRoot = join(repoRoot, 'web', 'src');

const HEADING = '## API risk register';

// Only the Where column is an anchor surface. API/feature, Baseline, Guarded?
// and Behavior columns quote CSS properties and JS expressions as prose, and a
// marker there would have nothing to be checked against.
const WHERE_COLUMN = 1;

// A code span naming a file this repo ships: a path into web/src/ (or one of
// the two roots that sit directly in it). Anchored end to end so a marker that
// merely mentions a filename can't be mistaken for a path.
const SOURCE_PATH = /^[A-Za-z0-9_.+\-/]+\.(?:ts|svelte|css|html)$/;

// `path` → `marker`. The arrow is only an anchor when a source path sits on its
// left, which keeps it clear of the column's ordinary prose arrows
// (".ai-stage height → --stage-h").
//
// A row whose guard IS a relationship between two declarations needs both, so
// an anchor can carry several markers:
//   `a` then `b`  — both present, a before b. For a same-property value
//                   fallback, where losing the order loses the guard:
//                   `height: 100vh` must precede `height: 100dvh`.
//   `a` + `b`     — both present, order irrelevant. For a prefixed twin, where
//                   the two are separate properties that both apply.
// Order is only asserted where it is load-bearing; demanding it of a twin pair
// would fail a harmless reordering and teach people to distrust the guard.
const ANCHOR_HEAD = /`([^`]+)`[^\S\n]*→[^\S\n]*/g;
const LEADING_MARKER = /^`([^`]+)`/;
const MARKER_SEPARATOR = /^[^\S\n]+(then|\+)[^\S\n]+(?=`)/;
const CODE_SPAN = /`([^`]+)`/g;

// A marker must match code, not the prose around it. `color-mix` appears twice
// in the comment above ColorPicker's own color-mix declarations ("rgba fallback
// precedes the color-mix"), so a comment-blind check keeps passing after both
// declarations are deleted — the anchor would then prove only that someone once
// wrote about the API.
// Stripping has to be a single left-to-right scan rather than a pair of
// regexes: run block-first and the `/*` inside secureStorage.ts's line comment
// ("// /api/admin/*).") opens a comment that swallows 6k characters of real
// code to the next `*/`; run line-first and the mirror case bites. Only a scan
// that meets each opener in source order gets both right, and copying string
// literals through verbatim keeps a "https://" or a quoted "/*" from opening
// one at all.
//
// Regex literals are deliberately not tracked — telling `/` division from `/`
// regex needs real parsing. A regex containing `\/\/` would over-strip, and
// over-stripping is the safe direction: it can only turn a live anchor red,
// which someone then investigates, never green.

// `mask: radial-gradient` is a substring of `-webkit-mask: radial-gradient`, so
// a plain includes() reports the unprefixed declaration as present when only
// the prefixed twin survives — the marker then fails to prove even that the API
// is used, let alone guarded. A match has to start and end at a token boundary.
// `-` counts as a token character precisely so a vendor prefix cannot supply
// the match.
const TOKEN_CHAR = /[A-Za-z0-9_-]/;

// What the column used to be, and must never silently become again.
const LINE_PIN = /`[^`]*\.(?:ts|svelte|css|html)[^`]*:\d/;

function registerRows(markdown) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => line.startsWith(HEADING));
  if (start < 0) throw new Error(`${HEADING} not found in docs/COMPATIBILITY.md`);
  const after = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  const end = after < 0 ? lines.length : after;

  return lines
    .slice(start, end)
    .filter((line) => line.startsWith('|'))
    .map((line) =>
      line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim())
    )
    .filter((cells) => cells.length > WHERE_COLUMN)
    .filter((cells) => !/^-+$/.test(cells[0]))
    .filter((cells) => cells[0] !== 'API / feature');
}

export function strippedSource(text) {
  let out = '';
  let at = 0;
  while (at < text.length) {
    if (text.startsWith('/*', at)) {
      const close = text.indexOf('*/', at + 2);
      at = close === -1 ? text.length : close + 2;
      out += ' ';
    } else if (text.startsWith('//', at)) {
      const eol = text.indexOf('\n', at);
      at = eol === -1 ? text.length : eol;
    } else if (text.startsWith('<!--', at)) {
      const close = text.indexOf('-->', at + 4);
      at = close === -1 ? text.length : close + 3;
      out += ' ';
    } else if (text[at] === '"' || text[at] === "'" || text[at] === '`') {
      const quote = text[at];
      out += text[at++];
      while (at < text.length) {
        if (text[at] === '\\') {
          out += text.slice(at, at + 2);
          at += 2;
          continue;
        }
        out += text[at];
        if (text[at++] === quote) break;
      }
    } else {
      out += text[at++];
    }
  }
  return out;
}

// Index of the first token-boundary occurrence of `marker`, or -1.
export function markerIndex(text, marker, from = 0) {
  for (let at = text.indexOf(marker, from); at !== -1; at = text.indexOf(marker, at + 1)) {
    const before = at === 0 ? '' : text[at - 1];
    const after = text[at + marker.length] ?? '';
    const opensCleanly = !TOKEN_CHAR.test(marker[0]) || !TOKEN_CHAR.test(before);
    const closesCleanly = !TOKEN_CHAR.test(marker.at(-1)) || !TOKEN_CHAR.test(after);
    if (opensCleanly && closesCleanly) return at;
  }
  return -1;
}

// Which of an anchor's markers the file fails to satisfy. `then` walks forward
// from the previous match so the order is asserted, not just co-presence.
export function unmetMarkers(text, { markers, ordered }) {
  const code = strippedSource(text);
  const unmet = [];
  let from = 0;
  for (const marker of markers) {
    const at = markerIndex(code, marker, ordered ? from : 0);
    if (at === -1) unmet.push(marker);
    else if (ordered) from = at + marker.length;
  }
  return unmet;
}

export function anchorsIn(cell) {
  const anchors = [];
  for (const head of [...cell.matchAll(ANCHOR_HEAD)]) {
    const path = head[1];
    if (!SOURCE_PATH.test(path)) continue;

    const markers = [];
    let rest = cell.slice(head.index + head[0].length);
    let ordered = false;
    for (;;) {
      const marker = LEADING_MARKER.exec(rest);
      if (!marker) break;
      markers.push(marker[1]);
      rest = rest.slice(marker[0].length);

      const separator = MARKER_SEPARATOR.exec(rest);
      if (!separator) break;
      ordered ||= separator[1] === 'then';
      rest = rest.slice(separator[0].length);
    }
    if (markers.length) anchors.push({ path, markers, ordered });
  }
  return anchors;
}

// Every source path in the column must carry a marker. A path on its own would
// re-open the exact hole this test closes: the file still exists, so nothing
// fails, while the API it was cited for has moved elsewhere.
export function unanchoredPaths(cell) {
  const anchored = new Set(anchorsIn(cell).flatMap(({ path, markers }) => [path, ...markers]));
  return [...cell.matchAll(CODE_SPAN)]
    .map(([, span]) => span)
    .filter((span) => SOURCE_PATH.test(span) && !anchored.has(span));
}

const rows = registerRows(readFileSync(registerDoc, 'utf8'));
const sources = new Map();

function sourceText(path) {
  if (!sources.has(path)) {
    const file = join(sourceRoot, path);
    const readable = existsSync(file) && statSync(file).isFile();
    sources.set(path, readable ? readFileSync(file, 'utf8') : null);
  }
  return sources.get(path);
}

describe('COMPATIBILITY.md API risk register', () => {
  it('finds the register table', () => {
    expect(rows.length).toBeGreaterThan(20);
  });

  // Self-check: a parser that silently matched nothing would let every row
  // below pass by having no anchors to check.
  it('resolves anchors out of the Where column', () => {
    const anchors = rows.flatMap((cells) => anchorsIn(cells[WHERE_COLUMN]));

    // Deliberately far below the current count: the point is to catch a parser
    // that silently matches nothing, not to pin a number that a legitimate
    // collapse of an over-cited row would have to keep bumping down.
    expect(anchors.length).toBeGreaterThan(20);
  });

  it('reads a path → marker pair as an anchor and ordinary prose as prose', () => {
    expect(anchorsIn('`lib/idle.ts` → `requestIdleCallback`')).toEqual([
      { path: 'lib/idle.ts', markers: ['requestIdleCallback'], ordered: false },
    ]);
    expect(anchorsIn('`.ai-stage` height → `--stage-h` for the fall distance')).toEqual([]);
    expect(anchorsIn('avoid — no current usage')).toEqual([]);
  });

  it('reads multi-marker anchors, keeping `then` ordered and `+` unordered', () => {
    expect(
      anchorsIn('`app.css` → `height: 100vh` then `height: 100dvh` (the `body` rule)')
    ).toEqual([{ path: 'app.css', markers: ['height: 100vh', 'height: 100dvh'], ordered: true }]);
    expect(
      anchorsIn('`app.css` → `backdrop-filter: blur(` + `-webkit-backdrop-filter: blur(`')
    ).toEqual([
      {
        path: 'app.css',
        markers: ['backdrop-filter: blur(', '-webkit-backdrop-filter: blur('],
        ordered: false,
      },
    ]);
    // A prose `+` between un-quoted words must not extend the marker list.
    expect(anchorsIn('`lib/idle.ts` → `requestIdleCallback` — idle work + first paint')).toEqual([
      { path: 'lib/idle.ts', markers: ['requestIdleCallback'], ordered: false },
    ]);
  });

  it('reports a source path left without a marker', () => {
    expect(unanchoredPaths('`lib/idle.ts` → `requestIdleCallback`')).toEqual([]);
    expect(unanchoredPaths('`lib/idle.ts` and `app.css`')).toEqual(['lib/idle.ts', 'app.css']);
  });

  // The false-green cases the drift guard exists to catch, each reproduced
  // against this predicate before it was written (PR review, #852). A marker
  // that survives its own guard's deletion proves nothing.
  describe('rejects a guard that has been removed', () => {
    const anchor = (markers, ordered = false) => ({ markers, ordered });

    it('a same-property fallback deleted out from under the modern value', () => {
      const guarded = 'body {\n  height: 100vh;\n  height: 100dvh;\n}';
      const stripped = 'body {\n  height: 100dvh;\n}';

      expect(unmetMarkers(guarded, anchor(['height: 100vh', 'height: 100dvh'], true))).toEqual([]);
      expect(unmetMarkers(stripped, anchor(['height: 100vh', 'height: 100dvh'], true))).toEqual([
        'height: 100vh',
      ]);
    });

    it('a fallback that follows the modern value instead of preceding it', () => {
      const reversed = 'body {\n  height: 100dvh;\n  height: 100vh;\n}';

      expect(unmetMarkers(reversed, anchor(['height: 100vh', 'height: 100dvh'], true))).toEqual([
        'height: 100dvh',
      ]);
    });

    it('a prefixed twin deleted', () => {
      const guarded =
        '.x::backdrop {\n  backdrop-filter: blur(4px);\n  -webkit-backdrop-filter: blur(4px);\n}';
      const stripped = '.x::backdrop {\n  backdrop-filter: blur(4px);\n}';
      const markers = ['backdrop-filter: blur(', '-webkit-backdrop-filter: blur('];

      expect(unmetMarkers(guarded, anchor(markers))).toEqual([]);
      expect(unmetMarkers(stripped, anchor(markers))).toEqual(['-webkit-backdrop-filter: blur(']);
    });

    // The unprefixed declaration is a substring of its own vendor-prefixed
    // twin, so includes() calls it present when only the prefix survives.
    it('an unprefixed declaration whose vendor twin would otherwise supply the match', () => {
      const prefixOnly = '.halo {\n  -webkit-mask: radial-gradient(farthest-side, #000);\n}';

      expect(unmetMarkers(prefixOnly, anchor(['mask: radial-gradient']))).toEqual([
        'mask: radial-gradient',
      ]);
      expect(
        unmetMarkers('.c {\n  -webkit-mask-image: var(--m);\n}', anchor(['mask-image']))
      ).toEqual(['mask-image']);
    });

    it('a declaration deleted while the comment describing it survives', () => {
      const commentOnly = `.hexagon.selected {
    /* rgba fallback precedes the color-mix (docs/COMPATIBILITY.md): pre-color-mix
       engines keep a neutral dark ring. */
  }`;
      const markers = ['background-color: rgba(', 'background-color: color-mix('];

      expect(unmetMarkers(commentOnly, anchor(markers, true))).toEqual(markers);
      expect(unmetMarkers(commentOnly, anchor(['color-mix']))).toEqual(['color-mix']);
    });

    it('a // comment, without mistaking a URL for one', () => {
      expect(strippedSource('// see requestIdleCallback\nconst a = 1;')).not.toContain(
        'requestIdleCallback'
      );
      expect(strippedSource("const url = 'https://example.com/idle';")).toContain('example.com');
    });
  });

  for (const cells of rows) {
    const api = cells[0];
    const where = cells[WHERE_COLUMN];

    it(`${api} cites live code`, () => {
      expect(where).not.toMatch(LINE_PIN);
      expect(unanchoredPaths(where)).toEqual([]);

      for (const anchor of anchorsIn(where)) {
        const text = sourceText(anchor.path);

        expect(text, `web/src/${anchor.path} does not exist`).not.toBeNull();
        expect(
          unmetMarkers(text, anchor),
          `web/src/${anchor.path} no longer satisfies this anchor` +
            (anchor.ordered ? ' (markers must appear in the order written)' : '')
        ).toEqual([]);
      }
    });
  }
});
