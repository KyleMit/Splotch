import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('captured canonical overlay decode', () => {
  it('retains the original detached decode after a later canonical image is published', async () => {
    vi.resetModules();
    const { captureCanonicalOverlaySource, rememberDecodedCanonicalOverlay } =
      await import('./overlay');
    const first = document.createElement('img');
    first.src = '/coloring/farm/cat-tall.overlay.svg';
    Object.defineProperty(first, 'naturalWidth', { value: 100 });
    rememberDecodedCanonicalOverlay(first);
    const captured = captureCanonicalOverlaySource('/coloring/farm/cat-tall.overlay.svg');
    const second = document.createElement('img');
    second.src = '/coloring/farm/cat-tall.dark.overlay.svg';
    Object.defineProperty(second, 'naturalWidth', { value: 100 });
    rememberDecodedCanonicalOverlay(second);

    expect(captured).toEqual({ canonicalUrl: first.src, decodedCanonicalImage: first });
    expect(captureCanonicalOverlaySource(second.src).decodedCanonicalImage).toBe(second);
    expect(captureCanonicalOverlaySource(first.src).decodedCanonicalImage).toBeNull();
  });

  it('leaves the successful decode available when another image fails to decode', async () => {
    vi.resetModules();
    const { captureCanonicalOverlaySource, rememberDecodedCanonicalOverlay } =
      await import('./overlay');
    const loaded = document.createElement('img');
    loaded.src = '/coloring/farm/cat-tall.overlay.svg';
    Object.defineProperty(loaded, 'naturalWidth', { value: 100 });
    rememberDecodedCanonicalOverlay(loaded);
    const failed = document.createElement('img');
    failed.src = '/coloring/farm/cow-tall.overlay.svg';
    rememberDecodedCanonicalOverlay(failed);

    expect(captureCanonicalOverlaySource(loaded.src).decodedCanonicalImage).toBe(loaded);
    expect(captureCanonicalOverlaySource(failed.src).decodedCanonicalImage).toBeNull();
  });
});
