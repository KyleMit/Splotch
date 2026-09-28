import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

type LockReply = { locked: boolean };

const mocks = vi.hoisted(() => ({ isLocked: vi.fn<() => Promise<LockReply>>() }));

vi.mock('$lib/platform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/platform')>()),
  isNative: () => true,
  getPlatform: () => 'ios',
}));
vi.mock('$lib/plugins/deviceLock', () => ({ DeviceLock: { isLocked: mocks.isLocked } }));

import SetupInstructions from './SetupInstructions.svelte';
import { settingsModal } from '$lib/state/ui.svelte';

let mounted: ReturnType<typeof mount> | null = null;

// The wide Settings shell keeps its sections mounted across a close, so the
// section has to notice each open on its own rather than relying on a remount.
function mountClosed() {
  const target = document.createElement('div');
  document.body.append(target);
  mounted = mount(SetupInstructions, { target });
  flushSync();
  return () => target.querySelector('.lock-heading')?.textContent?.trim() ?? '';
}

function setOpen(open: boolean) {
  if (open) settingsModal.show(null);
  else settingsModal.hide();
  flushSync();
}

function heldReply() {
  let release!: (reply: LockReply) => void;
  const reply = new Promise<LockReply>((resolve) => {
    release = resolve;
  });
  return { reply, release };
}

afterEach(async () => {
  settingsModal.hide();
  flushSync();
  if (mounted) await unmount(mounted);
  mounted = null;
  document.body.replaceChildren();
  mocks.isLocked.mockReset();
});

describe('SetupInstructions device-lock detection', () => {
  it('asks for the lock state on every Settings open, not once per mount', async () => {
    mocks.isLocked.mockResolvedValueOnce({ locked: true });
    mocks.isLocked.mockResolvedValueOnce({ locked: false });
    const lockHeading = mountClosed();
    expect(mocks.isLocked).not.toHaveBeenCalled();

    setOpen(true);
    await vi.waitFor(() => expect(lockHeading()).toMatch(/^Guided Access is on/));

    setOpen(false);
    setOpen(true);
    expect(lockHeading()).toBe('Enable Guided Access');
    await vi.waitFor(() => expect(mocks.isLocked).toHaveBeenCalledTimes(2));
    flushSync();
    expect(lockHeading()).toBe('Enable Guided Access');
  });

  it('drops a lock reply that lands after Settings closed and reopened', async () => {
    const stale = heldReply();
    mocks.isLocked.mockReturnValueOnce(stale.reply);
    mocks.isLocked.mockResolvedValueOnce({ locked: false });
    const lockHeading = mountClosed();

    setOpen(true);
    await vi.waitFor(() => expect(mocks.isLocked).toHaveBeenCalledOnce());
    setOpen(false);
    setOpen(true);
    await vi.waitFor(() => expect(mocks.isLocked).toHaveBeenCalledTimes(2));

    stale.release({ locked: true });
    await stale.reply;
    flushSync();
    expect(lockHeading()).toBe('Enable Guided Access');
  });
});
