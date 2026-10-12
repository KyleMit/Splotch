import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p) => readFileSync(new URL(`../../../../${p}`, import.meta.url), 'utf8');

// The page owns the safe area: viewport-fit=cover plus env(safe-area-inset-*)
// padding (ADR-0026). A WKWebView that also insets its content does so only
// after an in-session rotation on iPadOS 26.5, and WebKit keeps resolving
// touch targets at the un-inset position while drawing 32px lower — so every
// control answered touches a status bar's height above where it was drawn
// (issue 2212; docs/scratchpad/2026-08-25-native-rotation-undo-tap.md).
describe('iOS WebView content inset', () => {
  it('leaves the safe area to the page', () => {
    const config = JSON.parse(read('capacitor.config.json'));
    expect(config.ios?.contentInset).toBe('never');
  });
});
