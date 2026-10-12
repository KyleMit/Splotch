// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PAGE_INVENTORY_VIEWPORTS } from '../page-inventory/lib/page-inventory-report.mjs';

// Some Playwright specs run at the sizes the responsive page inventory
// captures, because that is where its critique found the crops they guard. The
// specs are TypeScript and the inventory is an untyped .mjs, so importing the
// constant would cost each spec its type checking — which makes this the drift
// guard that replaces the import. A device-list refresh that leaves a spec
// behind fails here instead of silently testing sizes nothing screenshots any
// more.
const SPECS = {
  'scroll-cue.spec.ts': [
    'ipad-mini-7',
    'ipad-pro-13-m4',
    'iphone-13-mini-landscape',
    'iphone-16-pro-max-landscape',
  ],
  'flows-parental-gate-lockout.spec.ts': [
    'iphone-13-mini-landscape',
    'iphone-16-pro-max-landscape',
  ],
};

// Each viewport is declared with its inventory id in a trailing comment, which is
// what ties the two sides together.
function declaredViewports(source) {
  return [...source.matchAll(/\{ width: (\d+), height: (\d+) \}; \/\/ ([\w-]+)$/gm)].map(
    ([, width, height, id]) => ({ id, width: Number(width), height: Number(height) })
  );
}

for (const [file, expectedIds] of Object.entries(SPECS)) {
  describe(`${file} tracks the page-inventory device list`, () => {
    const spec = readFileSync(join(import.meta.dirname, '..', '..', 'web/tests', file), 'utf8');
    const declared = declaredViewports(spec);

    it('declares every viewport against a real inventory id', () => {
      expect(declared.length).toBeGreaterThan(0);
      for (const { id, width, height } of declared) {
        const view = PAGE_INVENTORY_VIEWPORTS.find((candidate) => candidate.id === id);
        expect(view, `no page-inventory viewport ${id}`).toBeDefined();
        expect({ width, height }).toEqual({ width: view.width, height: view.height });
      }
    });

    it('covers the viewports the critique named', () => {
      expect(declared.map((view) => view.id).sort()).toEqual(expectedIds);
    });
  });
}
