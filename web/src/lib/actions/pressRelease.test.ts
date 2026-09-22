import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { PRESS_RELEASE_CLASS, PRESS_RELEASE_KEYFRAMES, playPressRelease } from './pressRelease';

// The path stays a parameter because Vite rewrites a literal
// `new URL('./literal', import.meta.url)` into the served asset's http URL,
// which readFileSync rejects (precedent: inkMotion.test.ts).
function sourceFile(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const appCss = sourceFile('../../app.css');
const palette = sourceFile('../components/ColorPalette.svelte');

describe('press release', () => {
  afterEach(() => document.documentElement.removeAttribute('data-reduce-motion'));

  it('names the keyframes app.css declares', () => {
    expect(appCss).toContain(`@keyframes ${PRESS_RELEASE_KEYFRAMES} {`);
  });

  it('names the class both pressed surfaces play the keyframes on', () => {
    expect(appCss).toContain(`.action-button.${PRESS_RELEASE_CLASS} {`);
    expect(palette).toContain(`.color-swatch:global(.${PRESS_RELEASE_CLASS}) {`);
  });

  it('adds the release class to start a press', () => {
    const button = document.createElement('button');
    playPressRelease(button);
    expect(button.classList.contains(PRESS_RELEASE_CLASS)).toBe(true);
  });

  it('plays nothing under reduced motion', () => {
    document.documentElement.setAttribute('data-reduce-motion', '');
    const button = document.createElement('button');
    button.classList.add(PRESS_RELEASE_CLASS);
    playPressRelease(button);
    expect(button.classList.contains(PRESS_RELEASE_CLASS)).toBe(false);
  });
});
