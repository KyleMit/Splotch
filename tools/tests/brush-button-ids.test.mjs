import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRUSH_BUTTON_BY_MODE } from '../perf/lib/brush-buttons.mjs';

// Drift guard for the Brush Menu's button ids (BRUSH_OPTIONS in
// web/src/lib/state/tool.svelte.ts). The app driver, the perf captures, and the
// browser probes select a brush by clicking its button, and none of them can
// import the app's Svelte rune module; the probes are injected into the page
// and cannot import at all. A renamed id would leave them clicking nothing —
// the toddler session's erase beat, for one, then draws ink instead of
// erasing, and the run still reports numbers. Extraction is a regex over the
// file text.
const repoRoot = join(import.meta.dirname, '..', '..');
const toolSource = readFileSync(join(repoRoot, 'web/src/lib/state/tool.svelte.ts'), 'utf8');
const brushOptionsBlock = /export const BRUSH_OPTIONS\b[^=]*=\s*\[([\s\S]*?)\];/.exec(
  toolSource
)?.[1];
const APP_BUTTON_ID_BY_BRUSH = Object.fromEntries(
  [...(brushOptionsBlock ?? '').matchAll(/brush: '(\w+)'[^}]*\bid: '(\w+)'/g)].map(
    ([, brush, id]) => [brush, id]
  )
);
const BRUSH_BY_APP_BUTTON_ID = Object.fromEntries(
  Object.entries(APP_BUTTON_ID_BY_BRUSH).map(([brush, id]) => [id, brush])
);
const APP_BUTTON_IDS = new Set(Object.keys(BRUSH_BY_APP_BUTTON_ID));

const BUTTON_ID_TOKEN = /\b(?:[a-z]+BrushButton|eraserButton)\b/g;
// A brush named on the same line as one button id — as a map key
// (`crayon: '#crayonBrushButton'`) or a quoted literal (the input recorder's
// `el.id === 'crayonBrushButton') recAction('brush', 'crayon')`) — is the brush
// that line takes the button to select.
const BRUSH_NAME = /\b(pen|crayon|magic|eraser):|'(pen|crayon|magic|eraser)'/g;

function buttonIdProblems(rel, source) {
  const problems = [];
  for (const line of source.split('\n')) {
    const ids = line.match(BUTTON_ID_TOKEN) ?? [];
    for (const id of ids) {
      if (!APP_BUTTON_IDS.has(id)) problems.push(`${rel}: #${id} is not a BRUSH_OPTIONS id`);
    }
    if (ids.length !== 1 || !APP_BUTTON_IDS.has(ids[0])) continue;
    const owner = BRUSH_BY_APP_BUTTON_ID[ids[0]];
    for (const [, key, literal] of line.matchAll(BRUSH_NAME)) {
      const brush = key ?? literal;
      if (brush !== owner) {
        problems.push(`${rel}: pairs ${brush} with #${ids[0]}, the app's ${owner} button`);
      }
    }
  }
  return problems;
}

// Tracked files only, as in palette-source.test.mjs: a filesystem walk would
// also read gitignored run output.
function toolsSources() {
  return execFileSync('git', ['ls-files', '-z', 'tools'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\0')
    .filter((rel) => /\.(mjs|js|ts)$/.test(rel) && !/(^|\/)tests\//.test(rel));
}

describe('brush button ids in tools match the app', () => {
  it('reads every Brush Menu entry from tool.svelte.ts', () => {
    expect(Object.keys(APP_BUTTON_ID_BY_BRUSH)).toEqual(['pen', 'crayon', 'magic', 'eraser']);
  });

  it('selects each brush through its own button in the shared capture map', () => {
    expect(BRUSH_BUTTON_BY_MODE).toEqual(
      Object.fromEntries(
        Object.entries(APP_BUTTON_ID_BY_BRUSH).map(([brush, id]) => [brush, `#${id}`])
      )
    );
  });

  it('flags a brush paired with another brush’s button, as a key or a literal', () => {
    const { crayon, eraser } = APP_BUTTON_ID_BY_BRUSH;

    expect(buttonIdProblems('a', `  crayon: '#${crayon}',`)).toEqual([]);
    expect(buttonIdProblems('a', `  magic: '#${eraser}',`)).toHaveLength(1);
    expect(
      buttonIdProblems('a', `else if (el.id === '${crayon}') recAction('brush', 'crayon');`)
    ).toEqual([]);
    expect(
      buttonIdProblems('a', `else if (el.id === '${crayon}') recAction('brush', 'pen');`)
    ).toHaveLength(1);
  });

  it('names only real button ids, each paired with its own brush', () => {
    const problems = [];
    const filesNamingIds = [];
    for (const rel of toolsSources()) {
      const source = readFileSync(join(repoRoot, rel), 'utf8');
      if (source.match(BUTTON_ID_TOKEN)) filesNamingIds.push(rel);
      problems.push(...buttonIdProblems(rel, source));
    }

    expect(problems).toEqual([]);
    expect(filesNamingIds).toEqual(
      expect.arrayContaining([
        'tools/app-driver/lib/app-driver.mjs',
        'tools/perf/lib/toddler-session.mjs',
        'tools/perf/probes/input-recorder.js',
        'tools/perf/probes/real-screen-probe.js',
      ])
    );
  });
});
