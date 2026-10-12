import { afterEach, describe, expect, it, vi } from 'vitest';
import { listenForStatusBarReentry } from './notchBand';

// Stays on the happy-dom default rather than the node opt-out its sibling uses:
// this is the one part of notchBand that touches `document`.

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

afterEach(() => Reflect.deleteProperty(document, 'visibilityState'));

describe('listenForStatusBarReentry', () => {
  // The case a visibility-only listener misses entirely. Capacitor's Android
  // WebView stays `visible` while its Activity is backgrounded and announces
  // re-entry through Cordova's document-level `resume` — so on the one platform
  // that actually hides its status bar, visibilitychange never fires.
  it('fires on resume even though visibility never changed', () => {
    setVisibility('visible');
    const onReentry = vi.fn();
    const stop = listenForStatusBarReentry(onReentry);

    document.dispatchEvent(new Event('resume'));

    expect(onReentry).toHaveBeenCalledTimes(1);
    stop();
  });

  it('fires when the document becomes visible', () => {
    setVisibility('visible');
    const onReentry = vi.fn();
    const stop = listenForStatusBarReentry(onReentry);

    document.dispatchEvent(new Event('visibilitychange'));

    expect(onReentry).toHaveBeenCalledTimes(1);
    stop();
  });

  it('ignores the hidden half of a visibility change', () => {
    setVisibility('hidden');
    const onReentry = vi.fn();
    const stop = listenForStatusBarReentry(onReentry);

    document.dispatchEvent(new Event('visibilitychange'));

    expect(onReentry).not.toHaveBeenCalled();
    stop();
  });

  it('detaches both listeners on teardown', () => {
    setVisibility('visible');
    const onReentry = vi.fn();

    listenForStatusBarReentry(onReentry)();
    document.dispatchEvent(new Event('resume'));
    document.dispatchEvent(new Event('visibilitychange'));

    expect(onReentry).not.toHaveBeenCalled();
  });
});
