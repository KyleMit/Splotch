// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { useBundledPageOutlines } from '../../experiments/native-architecture/src/drawing/bundledOutlines.web.ts';
import { BUNDLED_BOOK_OUTLINES } from '../../experiments/native-architecture/src/drawing/bundledOutlines.ts';
import { FARM_PAGE_IDS } from '../../experiments/native-architecture/src/drawing/bundledBooks.ts';
import { ROOT } from '../lib/proc.mjs';

const read = (path) =>
  readFileSync(join(ROOT, 'experiments/native-architecture/src', path), 'utf8');
const NATIVE_REEXPORT = /^export \{ (\w+) \} from '([^']+)';$/gm;
const WEB_LAZY_EXPORT =
  /export const (\w+) = lazySurface\(\(\) =>\s+import\('([^']+)'\)\.then\(\(module\) => module\.(\w+)\)\s+\);/g;
const SHEET_MOUNTERS = [
  'rsdDrawing/RsdDrawingScreen.tsx',
  'rsdDrawing/RsdPaperSlot.tsx',
  'rsdDrawing/RsdDrawingStatus.tsx',
];

describe('drawing sheets the web export loads on first use', () => {
  it('lazily load, under each name, exactly the module the native apps import directly', () => {
    const native = [...read('rsdDrawing/drawingSheets.ts').matchAll(NATIVE_REEXPORT)].map(
      ([, name, path]) => ({ name, path, member: name })
    );
    const web = [...read('rsdDrawing/drawingSheets.web.ts').matchAll(WEB_LAZY_EXPORT)].map(
      ([, name, path, member]) => ({ name, path, member })
    );
    expect(native.length).toBeGreaterThan(0);
    expect(web).toEqual(native);
  });

  it('mount each sheet inside its own surface boundary, so a failed load cannot blank the screen', () => {
    const names = [...read('rsdDrawing/drawingSheets.ts').matchAll(NATIVE_REEXPORT)].map(
      ([, name]) => name
    );
    const mounts = SHEET_MOUNTERS.flatMap((file) =>
      names.flatMap((name) =>
        [...read(file).matchAll(new RegExp(`<${name}\\b`, 'g'))].map((match) => ({
          name,
          before: read(file).slice(0, match.index),
        }))
      )
    );
    expect(new Set(mounts.map(({ name }) => name))).toEqual(new Set(names));
    for (const { name, before } of mounts) {
      const opened = before.lastIndexOf('<RsdSurfaceBoundary');
      expect(opened, name).toBeGreaterThan(before.lastIndexOf('</RsdSurfaceBoundary>'));
    }
  });
});

describe('bundled page line art on the web export', () => {
  let root;
  afterEach(() => {
    if (root) act(() => root.unmount());
    root = null;
  });

  async function render(pageId) {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const seen = [];
    function Probe() {
      seen.push(useBundledPageOutlines(pageId));
      return null;
    }
    root = createRoot(document.createElement('div'));
    await act(async () => root.render(createElement(Probe)));
    return seen;
  }

  it('renders nothing first, then the page chunk once it loads', async () => {
    const seen = await render('farm/dog');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(seen[0]).toBeUndefined();
    expect(seen.at(-1)).toEqual(BUNDLED_BOOK_OUTLINES['farm/dog']);
  });

  it('loads nothing for a page outside the bundled book', async () => {
    const seen = await render(null);
    expect(seen.every((outlines) => outlines === undefined)).toBe(true);
  });

  it('imports one chunk per bundled page', () => {
    const source = read('drawing/bundledOutlines.web.ts');
    for (const pageId of FARM_PAGE_IDS)
      expect(source).toContain(
        ['import(', `'./bundledFarm/${pageId.split('/')[1]}'`, ')'].join('')
      );
    expect(source).not.toMatch(/^import .* from '\.\/bundledFarm\//m);
  });
});
