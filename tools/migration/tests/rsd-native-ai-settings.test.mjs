import { act, createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { host, mount, records, root, checkedSwitch } from './rsd-native-selection-host.mjs';
import { RsdAiSettingsSection } from '../../../experiments/native-architecture/src/rsdDrawing/RsdAiSettingsSection.tsx';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import {
  AI_AUTO_SAVE_HELP,
  AI_SETTINGS_COPY,
  KEY_MESSAGES,
  KEY_STORAGE_NOTE,
  valuePropClaims,
} from '../../../experiments/native-architecture/src/settings/aiSettingsCopy.ts';

// Settings › AI Art through the released native renderer: the master switch over the explainer or
// the key manager and feature switches, as shipping's AiKeyManager.svelte lays them out.
const IDLE = {
  credential: 'free',
  remaining: 7,
  saved: null,
  checking: false,
  credentialResult: null,
  busy: false,
  journal: null,
  recovery: null,
};

function props({ aiEnabled = true, state = IDLE, owner = aiOwner(), handlers = {} } = {}) {
  return {
    settings: {
      status: 'ready',
      aiEnabled,
      aiCustomizationEnabled: true,
      autoSaveAiEnabled: false,
    },
    busy: false,
    ai: {
      owner,
      state,
      onToggle: handlers.onToggle ?? vi.fn(),
      onOpenKeysPage: handlers.onOpenKeysPage ?? vi.fn(),
    },
    onAiCustomizationChange: handlers.onAiCustomizationChange ?? vi.fn(),
    onAutoSaveAiChange: handlers.onAutoSaveAiChange ?? vi.fn(),
  };
}
function aiOwner() {
  return { setup: vi.fn(async () => {}), removeCredential: vi.fn(async () => {}) };
}
function section(sectionProps) {
  return createElement(
    DrawingAppearanceProvider,
    { preference: 'light' },
    createElement(RsdAiSettingsSection, sectionProps)
  );
}
const show = (sectionProps) => mount(section(sectionProps));
const rerender = (sectionProps) => act(async () => root.render(section(sectionProps)));
const control = (label) =>
  host.querySelector(`[aria-label="${label}"]`) ??
  [...host.querySelectorAll('button')].find((node) => node.textContent === label) ??
  null;
async function press(label) {
  const node = control(label);
  expect(node, label).not.toBeNull();
  expect(node.disabled, label).toBe(false);
  await act(async () => node.click());
}
async function type(label, value) {
  const field = records.props.findLast((item) => item.accessibilityLabel === label);
  expect(field, label).toBeDefined();
  await act(async () => field.onChange({ nativeEvent: { text: value } }));
}
const text = () => host.textContent.replace(/\s+/g, ' ');

describe('Settings › AI Art', () => {
  it('explains the feature while it is off and shows nothing that implies AI is active', async () => {
    const onToggle = vi.fn();
    await show(props({ aiEnabled: false, handlers: { onToggle } }));
    checkedSwitch(control(AI_SETTINGS_COPY.create), false);
    expect(text()).toContain(AI_SETTINGS_COPY.createHelp.off);
    expect(text()).toContain('What turning this on does');
    for (const caption of ['They draw', 'One magic tap', 'Ta-da!'])
      expect(text()).toContain(caption);
    for (const claim of valuePropClaims('none', 7)) expect(text()).toContain(claim);
    // Negative control: none of the enabled controls mount while the switch is off.
    for (const label of [
      AI_SETTINGS_COPY.customization,
      AI_SETTINGS_COPY.autoSave,
      'OpenAI API Key',
    ])
      expect(control(label), label).toBeNull();
    await press(AI_SETTINGS_COPY.create);
    expect(onToggle).toHaveBeenCalledExactlyOnceWith(true);
  });

  it.each([
    ['byok', 'Your OpenAI key is saved and ready whenever you turn this on.'],
    ['managed', "Your access code is saved — turn this on whenever you're ready."],
  ])('words the explainer for a saved %s', async (credential, claim) => {
    await show(props({ aiEnabled: false, state: { ...IDLE, credential, remaining: null } }));
    expect(text()).toContain(claim);
  });

  it.each([
    ['checking', { checking: true, remaining: null }, AI_SETTINGS_COPY.checkingAllowance],
    ['seven left', {}, '7 free AI creations left. No setup is needed.'],
    ['one left', { remaining: 1 }, '1 free AI creation left.'],
    ['used up', { remaining: 0 }, 'Your 10 free AI creations are used up. Add your own'],
    ['unreadable', { remaining: null }, AI_SETTINGS_COPY.allowanceUnavailable],
    [
      'vault unreadable',
      { credential: 'unavailable', remaining: null },
      AI_SETTINGS_COPY.allowanceUnavailable,
    ],
  ])('reports the free allowance while %s', async (_name, change, copy) => {
    await show(props({ state: { ...IDLE, ...change } }));
    expect(text()).toContain(copy);
    expect(text()).toContain(AI_SETTINGS_COPY.keyPromise);
    expect(text()).toContain(KEY_STORAGE_NOTE.ios);
  });

  it('holds the feature switches below the key manager and routes each to its owner', async () => {
    const onAiCustomizationChange = vi.fn();
    const onAutoSaveAiChange = vi.fn();
    await show(props({ handlers: { onAiCustomizationChange, onAutoSaveAiChange } }));
    checkedSwitch(control(AI_SETTINGS_COPY.create), true);
    checkedSwitch(control(AI_SETTINGS_COPY.customization), true);
    checkedSwitch(control(AI_SETTINGS_COPY.autoSave), false);
    expect(text()).toContain(AI_SETTINGS_COPY.customizationHelp);
    expect(text()).toContain(AI_AUTO_SAVE_HELP.native);
    await press(AI_SETTINGS_COPY.customization);
    await press(AI_SETTINGS_COPY.autoSave);
    expect(onAiCustomizationChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(onAutoSaveAiChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('sends an OpenAI key and an access code down their own paths, trimmed', async () => {
    const owner = aiOwner();
    await show(props({ owner }));
    await type('OpenAI API Key', '  sk-proj-fixture  ');
    await press('Save');
    await type('OpenAI API Key', 'family-code');
    await press('Save');
    expect(owner.setup.mock.calls).toEqual([
      ['byok', 'sk-proj-fixture'],
      ['managed', 'family-code'],
    ]);
  });

  it('names a retired Gemini key without sending it anywhere', async () => {
    const owner = aiOwner();
    await show(props({ owner }));
    await type('OpenAI API Key', 'AIzaFixture');
    await press('Save');
    expect(owner.setup).not.toHaveBeenCalled();
    expect(text()).toContain(KEY_MESSAGES.invalid.retiredGeminiKey);
  });

  it('keeps Save off while the field is empty or the owner is busy', async () => {
    await show(props());
    expect(control('Save').disabled).toBe(true);
    await type('OpenAI API Key', 'sk-x');
    expect(control('Save').disabled).toBe(false);
    await rerender(props({ state: { ...IDLE, busy: true } }));
    expect(control(AI_SETTINGS_COPY.checking).disabled).toBe(true);
  });

  it.each([
    [{ outcome: 'accepted', kind: 'byok' }, 'success', KEY_MESSAGES.accepted.byok],
    [{ outcome: 'accepted', kind: 'managed' }, 'success', KEY_MESSAGES.accepted.managed],
    [
      { outcome: 'invalid', kind: 'byok', detail: 'That key could not authenticate with OpenAI.' },
      'error',
      'That key could not authenticate with OpenAI.',
    ],
    [{ outcome: 'invalid', kind: 'managed', detail: null }, 'error', KEY_MESSAGES.invalid.managed],
    [
      { outcome: 'checkUnavailable', kind: 'byok', detail: null },
      'error',
      KEY_MESSAGES.invalid.checkUnavailable,
    ],
    [{ outcome: 'unreachable', kind: 'byok' }, 'error', KEY_MESSAGES.unreachable],
    [{ outcome: 'saveFailed', kind: 'managed' }, 'error', KEY_MESSAGES.saveFailed.managed],
    [{ outcome: 'forgetFailed', kind: 'byok' }, 'error', KEY_MESSAGES.forgetFailed.byok],
  ])('words the %o outcome as shipping does', async (result, status, copy) => {
    await show(props({ state: { ...IDLE, credentialResult: { id: 1, ...result } } }));
    // Negative control: an outcome from before this visit is not shown.
    expect(text()).not.toContain(copy);
    await rerender(props({ state: { ...IDLE, credentialResult: { id: 2, ...result } } }));
    const message = host.querySelector(status === 'error' ? '[role="alert"]' : '[role="status"]');
    expect(message?.textContent).toBe(copy);
  });

  it('shows a saved key masked, with Forget routed to the owner', async () => {
    const owner = aiOwner();
    const masked = `${'*'.repeat(20)}abcd`;
    await show(
      props({ owner, state: { ...IDLE, credential: 'byok', remaining: null, saved: masked } })
    );
    expect(text()).toContain('your own OpenAI API key');
    expect(control(AI_SETTINGS_COPY.maskedKeyLabel).value).toBe(masked);
    expect(control('OpenAI API Key')).toBeNull();
    await press(AI_SETTINGS_COPY.forget);
    expect(owner.removeCredential).toHaveBeenCalledExactlyOnceWith('byok');
  });

  it('shows a saved access code in full, with no key storage note', async () => {
    const owner = aiOwner();
    await show(
      props({
        owner,
        state: { ...IDLE, credential: 'managed', remaining: null, saved: 'family-code' },
      })
    );
    expect(text()).toContain('special access');
    expect(control(AI_SETTINGS_COPY.savedCodeLabel).value).toBe('family-code');
    expect(text()).not.toContain(KEY_STORAGE_NOTE.ios);
    await press(AI_SETTINGS_COPY.forget);
    expect(owner.removeCredential).toHaveBeenCalledExactlyOnceWith('managed');
  });

  it('opens the OpenAI keys page only through its caller', async () => {
    const onOpenKeysPage = vi.fn();
    await show(props({ handlers: { onOpenKeysPage } }));
    expect(text()).not.toContain('Create new secret key');
    const summary = [...host.querySelectorAll('button')].find((node) =>
      node.textContent.startsWith('How do I get an OpenAI API key?')
    );
    await act(async () => summary.click());
    expect(text()).toContain('Create new secret key');
    const link = host.querySelector('[role="link"]');
    await act(async () => link.click());
    expect(onOpenKeysPage).toHaveBeenCalledOnce();
  });
});
