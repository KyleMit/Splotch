import { afterEach, describe, expect, it } from 'vitest';
import { COLORING_OVERLAY_ID, getActiveOverlayExportSource } from './overlay';

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

describe('getActiveOverlayExportSource', () => {
  it('returns null when the overlay is missing', () => {
    expect(getActiveOverlayExportSource()).toBeNull();
  });

  it('returns null when the overlay is hidden', () => {
    appendLoadedOverlay().hidden = true;

    expect(getActiveOverlayExportSource()).toBeNull();
  });

  it('returns null when the overlay has not loaded', () => {
    const overlay = document.createElement('img');
    overlay.id = COLORING_OVERLAY_ID;
    document.body.append(overlay);

    expect(getActiveOverlayExportSource()).toBeNull();
  });

  it('returns null when the overlay id belongs to another element', () => {
    const overlay = document.createElement('div');
    overlay.id = COLORING_OVERLAY_ID;
    document.body.append(overlay);

    expect(getActiveOverlayExportSource()).toBeNull();
  });

  it('reuses a visible overlay when its decoded candidate is canonical', () => {
    const overlay = appendLoadedOverlay();
    overlay.src = '/coloring/farm/cat-tall.overlay.webp';
    Object.defineProperty(overlay, 'currentSrc', { value: overlay.src });

    expect(getActiveOverlayExportSource()).toEqual({
      canonicalUrl: overlay.src,
      decodedCanonicalImage: overlay,
    });
  });

  it('requests the canonical src when the decoded candidate is responsive', () => {
    const overlay = appendLoadedOverlay();
    overlay.src = '/coloring/farm/cat-tall.overlay.webp';
    Object.defineProperty(overlay, 'currentSrc', {
      value: `${location.origin}/coloring/max-1152px/farm/cat-tall.overlay.webp`,
    });

    expect(getActiveOverlayExportSource()).toEqual({
      canonicalUrl: overlay.src,
      decodedCanonicalImage: null,
    });
  });
});
