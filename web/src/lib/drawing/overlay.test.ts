import { afterEach, describe, expect, it } from 'vitest';
import { COLORING_OVERLAY_ID, getActiveOverlayImage } from './overlay';

afterEach(() => {
  document.body.replaceChildren();
});

function appendLoadedOverlay() {
  const overlay = document.createElement('img');
  overlay.id = COLORING_OVERLAY_ID;
  Object.defineProperty(overlay, 'naturalWidth', { value: 100 });
  document.body.append(overlay);
  return overlay;
}

describe('getActiveOverlayImage', () => {
  it('returns null when the overlay is missing', () => {
    expect(getActiveOverlayImage()).toBeNull();
  });

  it('returns null when the overlay is hidden', () => {
    appendLoadedOverlay().hidden = true;

    expect(getActiveOverlayImage()).toBeNull();
  });

  it('returns null when the overlay has not loaded', () => {
    const overlay = document.createElement('img');
    overlay.id = COLORING_OVERLAY_ID;
    document.body.append(overlay);

    expect(getActiveOverlayImage()).toBeNull();
  });

  it('returns null when the overlay id belongs to another element', () => {
    const overlay = document.createElement('div');
    overlay.id = COLORING_OVERLAY_ID;
    document.body.append(overlay);

    expect(getActiveOverlayImage()).toBeNull();
  });

  it('returns a visible, loaded overlay image', () => {
    const overlay = appendLoadedOverlay();

    expect(getActiveOverlayImage()).toBe(overlay);
  });
});
