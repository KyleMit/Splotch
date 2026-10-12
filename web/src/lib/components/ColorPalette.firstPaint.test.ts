import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PANEL_INSET } from '$lib/actionButtonLayout';
import { PALETTE_COLUMN_GEOMETRY } from '$lib/design/trimGeometry';

const paletteSource = readFileSync(
  resolve(process.cwd(), 'src/lib/components/ColorPalette.svelte'),
  'utf8'
);
const appCss = readFileSync(resolve(process.cwd(), 'src/app.css'), 'utf8');

function paletteBottomDeclaration() {
  const value = /--palette-bottom:\s*([^;]+);/.exec(paletteSource)?.[1];
  if (!value) throw new Error('Palette first-paint bottom declaration missing');
  return value.replace(/\s+/g, '');
}

describe('tablet palette first-paint geometry agreement', () => {
  it('shares the existing landscape action-size formula with the sibling panel', () => {
    const sharedRule = /\.color-palette,\s*\.actions-panel\s*\{([^}]+)\}/.exec(appCss)?.[1];
    expect(sharedRule).toContain('--action-btn-size: min(');
  });

  it('uses the same inset and swatch-centering constants before hydration', () => {
    expect(paletteBottomDeclaration()).toBe(
      `max(0px,calc(${PANEL_INSET}px+var(--action-btn-size)/2-${PALETTE_COLUMN_GEOMETRY.swatchPx / 2}px+var(--safe-area-bottom)))`
    );
  });
});
