import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PHONE_LANDSCAPE_QUERY,
  SETTINGS_WIDE_MIN_WIDTH_PX,
} from '../../web/src/lib/breakpoints.ts';
import { settingsShell } from '../../experiments/native-architecture/src/rsdDrawing/modalGeometry.ts';

// SettingsModal.svelte picks its shell from two media queries and the order of its template's
// branches. This reads both from the shipping source and answers each window the way a browser
// would, so a changed query, threshold or branch order fails here.
const MODAL = readFileSync(
  new URL('../../web/src/lib/components/SettingsModal.svelte', import.meta.url),
  'utf8'
);
const SHIPPING_CONSTANTS = { SETTINGS_WIDE_MIN_WIDTH_PX, PHONE_LANDSCAPE_QUERY };
// The phone shell is the template's fallback arm, after every query-named branch.
const FALLBACK_SHELL = 'phone';

function shippingQueries() {
  const wide = /const WIDE_QUERY = `([^`]+)`;/.exec(MODAL)?.[1];
  const call = /createSettingsMediaQueries\(\{([^}]+)\}\)/.exec(MODAL)?.[1];
  if (!wide || !call) throw new Error('SettingsModal.svelte no longer declares its shell queries');
  const named = { WIDE_QUERY: wide.replace(/\$\{(\w+)\}/g, (_, name) => SHIPPING_CONSTANTS[name]) };
  return Object.fromEntries(
    [...call.matchAll(/(\w+): (\w+)/g)].map(([, shell, name]) => [
      shell,
      named[name] ?? SHIPPING_CONSTANTS[name],
    ])
  );
}

// The query-named shells in the order the template tests them.
function shippingBranchOrder() {
  return [...MODAL.matchAll(/\{(?:#if|:else if) shell\.(\w+)\}/g)].map(([, shell]) => shell);
}

// A browser's answer for the media features these queries use, at a window of this size.
function matches(query, { width, height }) {
  return query.split(' and ').every((feature) => {
    const [, name, value] = /^\(([\w-]+): ([^)]+)\)$/.exec(feature.trim()) ?? [];
    if (name === 'orientation') return value === (width > height ? 'landscape' : 'portrait');
    const px = Number.parseFloat(value);
    if (name === 'min-width') return width >= px;
    if (name === 'max-width') return width <= px;
    if (name === 'min-height') return height >= px;
    if (name === 'max-height') return height <= px;
    throw new Error(`Unhandled media feature in ${query}`);
  });
}

const WINDOWS = [];
for (let width = 280; width <= 1400; width += 20)
  for (let height = 280; height <= 1400; height += 20) WINDOWS.push({ width, height });
WINDOWS.push(
  { width: SETTINGS_WIDE_MIN_WIDTH_PX - 1, height: 1000 },
  { width: SETTINGS_WIDE_MIN_WIDTH_PX, height: 1000 },
  { width: 900, height: 599.98 },
  { width: 900, height: 600 }
);

describe('the native Settings shell against SettingsModal.svelte', () => {
  it('reads a template branch for every query-named shell', () => {
    expect([...shippingBranchOrder()].sort()).toEqual(Object.keys(shippingQueries()).sort());
  });

  it('picks the shell shipping picks for every window', () => {
    const queries = shippingQueries();
    const order = shippingBranchOrder();
    for (const size of WINDOWS) {
      const shipping = order.find((shell) => matches(queries[shell], size)) ?? FALLBACK_SHELL;
      expect(settingsShell(size), `${size.width} x ${size.height}`).toBe(shipping);
    }
  });
});
