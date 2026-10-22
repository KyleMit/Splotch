// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createInstallPrompt } from '../../src/install/installPolicy.ts';
import { ROOT } from '../lib/proc.mjs';

const loaded = vi.hoisted(() => ({ count: 0, props: [] }));
const install = vi.hoisted(() => ({ owner: null }));
vi.mock('../../src/platform/installPrompt.ts', () => ({
  get installPrompt() {
    return install.owner;
  },
}));
vi.mock('../../src/rsdDrawing/RsdInstallBanner.tsx', () => {
  loaded.count += 1;
  return {
    RsdInstallBanner: (props) => {
      loaded.props.push(props);
      return createElement('aside', { 'data-banner': true });
    },
  };
});

const { RsdInstallBanner } = await import('../../src/rsdDrawing/installBannerSurface.web.ts');

const read = (path) => readFileSync(join(ROOT, 'src', path), 'utf8');
const DESKTOP_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const PROPS = { strokes: 0, hidden: false };
let root;
let host;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  install.owner = createInstallPrompt({
    device: {
      userAgent: DESKTOP_CHROME,
      platform: 'MacIntel',
      maxTouchPoints: 0,
      standalone: false,
    },
    storage: { read: () => null, write() {}, remove() {} },
  });
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
});

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

// Built from parts so tool-specifier-resolution does not read these source probes as imports.
const SURFACE_SPECIFIER = './installBannerSurface';
const BANNER_SPECIFIER = './RsdInstallBanner';

it('keeps the banner off the startup path: the drawing screen mounts it through the web split', () => {
  expect(read('rsdDrawing/RsdDrawingScreen.tsx')).toContain(
    `import { RsdInstallBanner } from '${SURFACE_SPECIFIER}';`
  );
  expect(read('rsdDrawing/installBannerSurface.web.ts')).not.toMatch(
    /^import \{[^}]*\} from '\.\/RsdInstallBanner';$/m
  );
  expect(read('rsdDrawing/installBannerSurface.ts')).toContain(
    `export { RsdInstallBanner } from '${BANNER_SPECIFIER}';`
  );
});

it('loads nothing while the browser offers no install, then the banner once it does', async () => {
  await act(async () => root.render(createElement(RsdInstallBanner, PROPS)));
  await settle();
  expect(loaded.count).toBe(0);
  expect(host.querySelector('[data-banner]')).toBeNull();
  await act(async () =>
    install.owner.capture({
      preventDefault() {},
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    })
  );
  await settle();
  expect(loaded.count).toBe(1);
  expect(host.querySelector('[data-banner]')).not.toBeNull();
  expect(loaded.props.at(-1)).toEqual(PROPS);
});
