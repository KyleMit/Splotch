// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PAGE_INVENTORY_VIEWPORTS } from '../page-inventory/lib/page-inventory-report.mjs';

// The document-scroll specs in scroll-cue.spec.ts run at the sizes the responsive
// page inventory captures, because that is where its critique found the crops
// they guard. The spec is TypeScript and the inventory is an untyped .mjs, so
// importing the constant would cost that file its type checking — which makes
// this the drift guard that replaces the import. A device-list refresh that
// leaves the spec behind fails here instead of silently testing sizes nothing
// screenshots any more.
const spec = readFileSync(
  join(import.meta.dirname, '..', '..', 'web/tests/scroll-cue.spec.ts'),
  'utf8'
);

// Each viewport is declared with its inventory id in a trailing comment, which is
// what ties the two sides together.
function declaredViewports(source) {
  return [...source.matchAll(/\{ width: (\d+), height: (\d+) \}; \/\/ ([\w-]+)$/gm)].map(
    ([, width, height, id]) => ({ id, width: Number(width), height: Number(height) })
  );
}

describe('the scroll-cue specs track the page-inventory device list', () => {
  const declared = declaredViewports(spec);

  it('declares every viewport against a real inventory id', () => {
    expect(declared.length).toBeGreaterThan(0);
    for (const { id, width, height } of declared) {
      const view = PAGE_INVENTORY_VIEWPORTS.find((candidate) => candidate.id === id);
      expect(view, `no page-inventory viewport ${id}`).toBeDefined();
      expect({ width, height }).toEqual({ width: view.width, height: view.height });
    }
  });

  it('covers both the tablet portraits and the phone landscapes the critique named', () => {
    expect(declared.map((view) => view.id).sort()).toEqual([
      'ipad-mini-7',
      'ipad-pro-13-m4',
      'iphone-13-mini-landscape',
      'iphone-16-pro-max-landscape',
    ]);
  });
});
