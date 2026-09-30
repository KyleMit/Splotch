import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveResult } from '$lib/saveNaming';
import type { HeldPicture } from '$lib/drawing/unsavedPictureStore';

// The held pictures live in memory here, so a report never reaches IndexedDB.
const heldPictures = vi.hoisted(() => ({ record: null as HeldPicture[] | null }));
vi.mock('$lib/drawing/unsavedPictureStore', () => ({
  createUnsavedPictureStore: () => ({
    read: async () => heldPictures.record,
    write: async (held: HeldPicture[] | null) => {
      heldPictures.record = held;
    },
  }),
}));

const retryImageSave = vi.hoisted(() => vi.fn<() => Promise<SaveResult>>());
vi.mock('$lib/drawing/imageSave', () => ({ retryImageSave }));

// Zero-duration reveals: Svelte then skips the Web Animation it would start, which happy-dom
// cancels on unmount with an unhandled rejection. Motion is not what these tests pin.
vi.mock('$lib/platform/calmTransition', () => ({ calm: () => () => ({ duration: 0 }) }));

import SaveFailureBanner from './SaveFailureBanner.svelte';
import { dismissSaveFailure, reportSaveFailure } from '$lib/state/saveFailure.svelte';

const ONE_PICTURE_ANNOUNCEMENT =
  "Your picture wasn't saved. Something went wrong while saving. Try again in a moment.";

let mounted: ReturnType<typeof mount> | null = null;

function mountBanner() {
  const target = document.createElement('div');
  document.body.append(target);
  mounted = mount(SaveFailureBanner, { target });
  flushSync();
  return target;
}

function statusRegions(target: HTMLElement) {
  return target.querySelectorAll('[role="status"]');
}

function statusRegion(target: HTMLElement) {
  const regions = statusRegions(target);
  expect(regions).toHaveLength(1);
  return regions[0];
}

function banner(target: HTMLElement) {
  return target.querySelector('.save-failure-banner');
}

function button(target: HTMLElement, name: string) {
  const match = [...target.querySelectorAll('button')].find(
    (candidate) => (candidate.getAttribute('aria-label') ?? candidate.textContent?.trim()) === name
  );
  if (!match) throw new Error(`The banner did not offer ${name}`);
  return match;
}

// The component writes its announcement in a frame callback; one queued after it runs after it.
async function nextFrame() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  flushSync();
}

async function reportFailedPicture() {
  await reportSaveFailure('failed', {
    blob: new Blob(['unsaved picture'], { type: 'image/png' }),
    baseName: 'splotch',
  });
  flushSync();
}

beforeEach(() => {
  heldPictures.record = null;
  retryImageSave.mockReset();
});

afterEach(async () => {
  dismissSaveFailure();
  if (mounted) await unmount(mounted);
  mounted = null;
  document.body.replaceChildren();
});

describe('SaveFailureBanner announcement', () => {
  it('writes a failure into the status region that was mounted before it', async () => {
    const target = mountBanner();
    const region = statusRegion(target);
    expect(region.textContent).toBe('');

    await reportFailedPicture();
    expect(banner(target)).not.toBeNull();
    expect(statusRegion(target)).toBe(region);
    expect(region.textContent).toBe('');

    await nextFrame();
    expect(region.textContent).toBe(ONE_PICTURE_ANNOUNCEMENT);
  });

  it('keeps the status role off the banner, so its controls are not part of the announcement', async () => {
    const target = mountBanner();
    await reportFailedPicture();
    await nextFrame();

    expect(banner(target)?.closest('[role="status"]')).toBeNull();
    expect(statusRegion(target).querySelector('button')).toBeNull();
  });

  it('writes a failure already open when the banner mounts a frame after the region appears', async () => {
    await reportFailedPicture();
    const target = mountBanner();
    const region = statusRegion(target);
    expect(banner(target)).not.toBeNull();
    expect(region.textContent).toBe('');

    await nextFrame();
    expect(statusRegion(target)).toBe(region);
    expect(region.textContent).toBe(ONE_PICTURE_ANNOUNCEMENT);
  });

  it('clears the announcement when the banner is dismissed', async () => {
    const target = mountBanner();
    await reportFailedPicture();
    await nextFrame();
    const region = statusRegion(target);

    button(target, 'Dismiss').click();
    flushSync();
    await nextFrame();

    expect(statusRegion(target)).toBe(region);
    expect(region.textContent).toBe('');
  });

  it('leaves the announcement unchanged while a retry is saving', async () => {
    let finishRetry: (result: SaveResult) => void = () => {};
    retryImageSave.mockImplementation(
      () => new Promise<SaveResult>((resolve) => (finishRetry = resolve))
    );
    const target = mountBanner();
    await reportFailedPicture();
    await nextFrame();
    const region = statusRegion(target);

    button(target, 'Try again').click();
    await vi.waitFor(() => expect(retryImageSave).toHaveBeenCalledOnce());
    flushSync();
    await nextFrame();

    expect(button(target, 'Saving…').getAttribute('aria-busy')).toBe('true');
    expect(region.textContent).toBe(ONE_PICTURE_ANNOUNCEMENT);

    finishRetry({ status: 'failed' });
    await vi.waitFor(() => expect(button(target, 'Try again')).toBeDefined());
    await nextFrame();
    expect(region.textContent).toBe(ONE_PICTURE_ANNOUNCEMENT);
  });
});
