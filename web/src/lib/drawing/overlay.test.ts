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

  it('reuses the decoded canonical image used by native presentation', () => {
    const overlay = appendLoadedOverlay();
    overlay.src = '/coloring/farm/cat-tall.overlay.svg';
    overlay.dataset.canonicalUrl = '/coloring/farm/cat-tall.overlay.svg';
    Object.defineProperty(overlay, 'currentSrc', { value: overlay.src });

    expect(getActiveOverlayExportSource()).toEqual({
      canonicalUrl: overlay.src,
      decodedCanonicalImage: overlay,
    });
  });

  it('requests the canonical SVG when a visible candidate is not canonical', () => {
    const overlay = appendLoadedOverlay();
    overlay.src = '/coloring/farm/cat-tall.selector.webp';
    overlay.dataset.canonicalUrl = '/coloring/farm/cat-tall.overlay.svg';
    Object.defineProperty(overlay, 'currentSrc', {
      value: overlay.src,
    });

    expect(getActiveOverlayExportSource()).toEqual({
      canonicalUrl: `${location.origin}/coloring/farm/cat-tall.overlay.svg`,
      decodedCanonicalImage: null,
    });
  });

  it('fails closed when a visible candidate has no canonical source', () => {
    const overlay = appendLoadedOverlay();
    overlay.src = '/coloring/farm/cat-tall.selector.webp';

    expect(getActiveOverlayExportSource()).toBeNull();
  });
});
