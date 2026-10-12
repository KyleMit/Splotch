import { flushSync, mount, unmount } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { verifyCredential, VerifyCredentialResult } from '$lib/ai/verifyCredential';
import type { setUserSubmittedAiUserApiKey } from '$lib/state/aiKey';

const mocks = vi.hoisted(() => ({
  verifyCredential: vi.fn<typeof verifyCredential>(),
  setUserSubmittedAiUserApiKey: vi.fn<typeof setUserSubmittedAiUserApiKey>(),
}));

vi.mock('$lib/ai/verifyCredential', () => ({ verifyCredential: mocks.verifyCredential }));
vi.mock('$lib/state/aiKey', () => ({
  setUserSubmittedAiUserApiKey: mocks.setUserSubmittedAiUserApiKey,
}));
// The switch swaps two revealed blocks; happy-dom rejects each unfinished Web
// Animation it cancels, so the reveal runs with no duration here.
vi.mock('./sectionReveal', () => ({ sectionReveal: () => ({}) }));

import AiKeyManager from './AiKeyManager.svelte';
import { setAiImage, settingsState } from '$lib/state/settings.svelte';
import { settingsModal } from '$lib/state/ui.svelte';

const VERIFIED_KEY: VerifyCredentialResult = { ok: true, kind: 'apiKey' };

let mounted: ReturnType<typeof mount> | null = null;

function held<T>() {
  let release!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

// Drains every continuation a released reply schedules, including the ones a
// regression would add, so a test can assert that nothing happened.
function settle() {
  return new Promise((resolve) => setTimeout(resolve));
}

function mountWithAiOn() {
  setAiImage(true);
  settingsModal.show(null);
  const target = document.createElement('div');
  document.body.append(target);
  mounted = mount(AiKeyManager, { target });
  flushSync();
  return target;
}

function submitKey(section: HTMLElement) {
  const input = section.querySelector<HTMLInputElement>('#aiKeyInput');
  if (!input) throw new Error('The key field is not showing');
  input.value = 'sk-test-key';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  saveButton(section)?.click();
  flushSync();
}

function saveButton(section: HTMLElement) {
  return section.querySelector<HTMLButtonElement>('.access-code-submit');
}

function toggleAi(section: HTMLElement) {
  section.querySelector<HTMLButtonElement>('#aiImageToggle')?.click();
  flushSync();
}

afterEach(async () => {
  settingsModal.hide();
  flushSync();
  if (mounted) await unmount(mounted);
  mounted = null;
  document.body.replaceChildren();
  setAiImage(false);
  mocks.verifyCredential.mockReset();
  mocks.setUserSubmittedAiUserApiKey.mockReset();
});

// ADR-0127 makes the switch the master control: a key check still in flight
// when the parent switches AI off must not switch it back on when it returns.
describe('AiKeyManager Create AI Images switch', () => {
  it('stays off when a key check returns after the switch went off', async () => {
    const check = held<VerifyCredentialResult>();
    mocks.verifyCredential.mockReturnValueOnce(check.promise);
    mocks.setUserSubmittedAiUserApiKey.mockResolvedValue(true);
    const section = mountWithAiOn();

    submitKey(section);
    expect(saveButton(section)?.textContent?.trim()).toBe('Checking…');
    toggleAi(section);
    check.release(VERIFIED_KEY);
    await settle();
    flushSync();

    expect(settingsState.aiImageEnabled).toBe(false);
    expect(mocks.setUserSubmittedAiUserApiKey).not.toHaveBeenCalled();
    toggleAi(section);
    expect(saveButton(section)?.textContent?.trim()).toBe('Save');
  });

  // The store double reports the save as landed whoever owns it, so this pins
  // the component's own ownership check, not the coordinator's rollback.
  it('stays off when a key save lands after the switch went off', async () => {
    const save = held<boolean>();
    mocks.verifyCredential.mockResolvedValueOnce(VERIFIED_KEY);
    mocks.setUserSubmittedAiUserApiKey.mockReturnValueOnce(save.promise);
    const section = mountWithAiOn();

    submitKey(section);
    await vi.waitFor(() => expect(mocks.setUserSubmittedAiUserApiKey).toHaveBeenCalledOnce());
    toggleAi(section);
    save.release(true);
    await settle();
    flushSync();

    expect(settingsState.aiImageEnabled).toBe(false);
  });
});
