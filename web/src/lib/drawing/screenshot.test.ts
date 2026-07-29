import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { POLAROID_DURATION_MS } from './screenshot';

const appCssPath = '../../app.css';

describe('polaroid animation', () => {
  it('keeps the CSS animation duration aligned with overlay teardown', () => {
    const css = readFileSync(new URL(appCssPath, import.meta.url), 'utf8');
    const animation = css.match(
      /\.polaroid-frame\s*\{[^}]*\banimation:\s*polaroid-show\s+(\d+(?:\.\d+)?)s\b/
    );

    expect(animation, '.polaroid-frame declares the polaroid-show animation').not.toBeNull();
    expect(Number(animation![1]) * 1000).toBe(POLAROID_DURATION_MS);
  });
});
