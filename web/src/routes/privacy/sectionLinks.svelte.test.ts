import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSectionLinks, sectionUrl } from './sectionLinks.svelte';
import { SECTIONS } from './contents';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(writeText = vi.fn<(url: string) => Promise<void>>().mockResolvedValue()) {
  vi.useFakeTimers();
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  const replace = vi.spyOn(history, 'replaceState').mockImplementation(() => {});
  const links = createSectionLinks();
  return { links, writeText, replace };
}

describe('privacy section links', () => {
  it.each(SECTIONS)('shares the public $id URL in either build', ({ id }) => {
    expect(sectionUrl(id)).toBe(`https://splotch.art/privacy#${id}`);
  });

  it('copies without scrolling, preserves history state and clears confirmation', async () => {
    const { links, writeText, replace } = setup();
    const event = new MouseEvent('click', { cancelable: true });
    await links.copy(event, 'on-device');
    expect(event.defaultPrevented).toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://splotch.art/privacy#on-device');
    expect(replace).toHaveBeenCalledWith(history.state, '', '#on-device');
    expect(links.copied).toBe('on-device');
    expect(links.announcement).toBe('Link to “What stays on your device” copied.');
    vi.advanceTimersByTime(2000);
    expect(links.copied).toBeNull();
    expect(links.announcement).toBe('');
    links.dispose();
  });

  it('restarts the confirmation timer when another section is copied', async () => {
    const { links } = setup();
    await links.copy(new MouseEvent('click'), 'reports');
    vi.advanceTimersByTime(1500);
    await links.copy(new MouseEvent('click'), 'contact');
    vi.advanceTimersByTime(500);
    expect(links.copied).toBe('contact');
    vi.advanceTimersByTime(1500);
    expect(links.copied).toBeNull();
    links.dispose();
  });

  it('publishes a fresh announcement when the same section is copied again', async () => {
    const { links } = setup();
    const announcements: string[] = [];
    const stop = $effect.root(() => {
      $effect(() => {
        announcements.push(links.announcement);
      });
    });
    try {
      flushSync();
      await links.copy(new MouseEvent('click'), 'contact');
      flushSync();
      await links.copy(new MouseEvent('click'), 'contact');
      flushSync();
      expect(announcements).toEqual([
        '',
        'Link to “Changes and contact” copied.',
        '',
        'Link to “Changes and contact” copied.',
      ]);
    } finally {
      stop();
      links.dispose();
    }
  });

  it('leaves normal anchor navigation available without a clipboard', async () => {
    const { links } = setup();
    vi.stubGlobal('navigator', {});
    const event = new MouseEvent('click', { cancelable: true });
    await links.copy(event, 'contact');
    expect(event.defaultPrevented).toBe(false);
    expect(links.copied).toBeNull();
    links.dispose();
  });

  it('navigates to the fragment after a rejected clipboard write', async () => {
    const { links, replace } = setup(vi.fn().mockRejectedValue(new Error('Denied')));
    const fallback = { hash: '' };
    vi.stubGlobal('location', fallback);
    await links.copy(new MouseEvent('click'), 'contact');
    expect(fallback.hash).toBe('contact');
    expect(replace).not.toHaveBeenCalled();
    expect(links.announcement).toBe('');
    links.dispose();
  });

  it.each(['metaKey', 'ctrlKey', 'shiftKey', 'altKey'])('preserves %s link clicks', async (key) => {
    const { links, writeText } = setup();
    const event = new MouseEvent('click', { cancelable: true, [key]: true });
    await links.copy(event, 'contact');
    expect(event.defaultPrevented).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
    links.dispose();
  });

  it('ignores a late copy result after a newer copy', async () => {
    let finish!: () => void;
    const { links, replace } = setup(
      vi
        .fn()
        .mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)))
        .mockResolvedValue(undefined)
    );
    const older = links.copy(new MouseEvent('click'), 'reports');
    await links.copy(new MouseEvent('click'), 'contact');
    finish();
    await older;
    expect(links.copied).toBe('contact');
    expect(replace).toHaveBeenCalledTimes(1);
    links.dispose();
  });

  it('ignores a copy resolving after the page is disposed', async () => {
    let finish!: () => void;
    const { links, replace } = setup(
      vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    );
    const pending = links.copy(new MouseEvent('click'), 'contact');
    links.dispose();
    finish();
    await pending;
    expect(links.copied).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
