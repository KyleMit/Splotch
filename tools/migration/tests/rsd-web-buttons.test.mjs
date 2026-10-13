import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, it } from 'vitest';

// Each render compiles the button module graph through Babel from cold.
const RENDER_TIMEOUT_MS = 60_000;
const RENDERER = join(import.meta.dirname, '../render-rsd-web-buttons.mjs');
const seams = mkdtempSync(join(tmpdir(), 'splotch-rsd-web-'));
afterAll(() => rmSync(seams, { recursive: true }));

function render(...args) {
  const result = spawnSync(process.execPath, [RENDERER, ...args], {
    encoding: 'utf8',
    timeout: RENDER_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

function hosts({ defaultClasses, markup }) {
  const defaults = new Set(defaultClasses.split(' '));
  return Object.entries(markup).map(([name, html]) => {
    const button = /^<button\b[^>]*>/.exec(html)[0];
    const classes = /class="([^"]*)"/.exec(button)[1].split(' ');
    return {
      name,
      button,
      ownClasses: classes.filter((name) => !defaults.has(name)).length,
      style: /style="([^"]*)"/.exec(button)?.[1] ?? '',
    };
  });
}

// The fewest compiled classes each specimen's own styles add over React Strict DOM's button
// defaults. The direct caller's two styles declare seven atomic values.
const MIN_OWN_CLASSES = { pressable: 7, button: 10, corner: 10, tile: 10, flyout: 10 };

it(
  'compiles every button skin, and a style array passed straight to RsdPressable, into classes on the web',
  () => {
    const rendered = hosts(render());
    expect(rendered.map(({ name }) => name)).toEqual(Object.keys(MIN_OWN_CLASSES));
    for (const { name, button, ownClasses } of rendered) {
      expect(button, name).not.toContain('[object Object]');
      expect(ownClasses, name).toBeGreaterThanOrEqual(MIN_OWN_CLASSES[name]);
    }
    // The tile and flyout faces size through dynamic styles, which compile to custom properties.
    expect(rendered.slice(3).map(({ style }) => style)).toEqual([
      expect.stringContaining('--x-width:60px'),
      expect.stringContaining('--x-width:60px'),
    ]);
  },
  RENDER_TIMEOUT_MS
);

it(
  'fails a pressable that hides its style from the transform in a spread',
  () => {
    const spread = join(seams, 'SpreadPressable.tsx');
    writeFileSync(
      spread,
      [
        "import type { ComponentProps } from 'react';",
        "import { html } from 'react-strict-dom';",
        'export function RsdPressable(props: ComponentProps<typeof html.button>) {',
        '  return <html.button {...props} />;',
        '}',
      ].join('\n')
    );
    for (const { name, button, ownClasses } of hosts(render(`--pressable=${spread}`))) {
      expect(button, name).toContain('[object Object]');
      expect(ownClasses, name).toBe(0);
    }
  },
  RENDER_TIMEOUT_MS
);
