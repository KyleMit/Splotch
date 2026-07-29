import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appCssPath = '../../app.css';
const screenshotSourcePath = './screenshot.ts';

describe('polaroid animation', () => {
  it('keeps the CSS animation duration aligned with overlay teardown', () => {
    const css = readFileSync(new URL(appCssPath, import.meta.url), 'utf8');
    const screenshotSource = readFileSync(new URL(screenshotSourcePath, import.meta.url), 'utf8');
    const animation = css.match(
      /\.polaroid-frame\s*\{[^}]*\banimation:\s*polaroid-show\s+(\d+(?:\.\d+)?)s\b/
    );
    const teardownDuration = screenshotSource.match(/\bconst POLAROID_DURATION_MS = (\d+);/);

    expect(animation, '.polaroid-frame declares the polaroid-show animation').not.toBeNull();
    expect(teardownDuration, 'screenshot teardown declares POLAROID_DURATION_MS').not.toBeNull();
    expect(Number(animation![1]) * 1000).toBe(Number(teardownDuration![1]));
  });
});
