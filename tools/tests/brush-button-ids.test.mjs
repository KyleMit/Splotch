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
const APP_BUTTON_IDS = new Set(Object.values(APP_BUTTON_ID_BY_BRUSH));

const BUTTON_ID_TOKEN = /\b(?:[a-z]+BrushButton|eraserButton)\b/g;
const BRUSH_SELECTOR_PAIR = /\b(pen|crayon|magic|eraser): '#(\w+)'/g;

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

  it('names only real button ids, each paired with its own brush', () => {
    const problems = [];
    const filesNamingIds = [];
    for (const rel of toolsSources()) {
      const source = readFileSync(join(repoRoot, rel), 'utf8');
      const ids = source.match(BUTTON_ID_TOKEN) ?? [];
      if (ids.length) filesNamingIds.push(rel);
      for (const id of ids) {
        if (!APP_BUTTON_IDS.has(id)) problems.push(`${rel}: #${id} is not a BRUSH_OPTIONS id`);
      }
      for (const [, brush, id] of source.matchAll(BRUSH_SELECTOR_PAIR)) {
        const expected = APP_BUTTON_ID_BY_BRUSH[brush];
        if (APP_BUTTON_IDS.has(id) && id !== expected) {
          problems.push(`${rel}: ${brush} selects #${id}, but the app's ${brush} is #${expected}`);
        }
      }
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
