import { describe, expect, it, vi } from 'vitest';
import { createDrawingProduct } from '../../src/product/createDrawingProduct.ts';
import { createNativeAi } from '../../src/ai/generation.ts';
import { FREE_LIMIT } from '../../src/ai/contract.ts';
import { createSoundSettings, parseSoundSettings } from '../../src/settings/soundSettings.ts';
import { nativeAiBoundary } from './native-ai-boundary.mjs';

const storage = vi.hoisted(() => ({ requestPersistentStorage: vi.fn(async () => true) }));
vi.mock('../../src/platform/persistentStorage.ts', () => storage);

// Settings › AI Art's owners: schema 15, the master switch and the credential read, save and
// forget, none of which asks for a grown-up check, as in shipping. The copy and geometry checks
// against shipping are native-ai-settings-drift.test.mjs.
const VERSION_14 = {
  version: 14,
  soundEnabled: true,
  strokeWidth: 'thick',
  eraserWidth: 'medium',
  selectedColor: 'Purple',
  customColors: [],
  appearance: 'dark',
  aiEnabled: true,
  parentPolicies: {
    ai: 'session',
    imageReport: 'always',
    externalLinks: 'always',
    feedback: 'always',
    parentCenter: 'always',
  },
  coloringBookEnabled: false,
  soundVolume: 75,
  drawingSoundEnabled: true,
  deleteSoundEnabled: false,
  undoButtonEnabled: false,
  strokeWidthControlEnabled: true,
  orientation: 'landscape',
  saveOnDeleteEnabled: true,
  buttonScale: 110,
  reduceMotion: 'reduce',
  whatsNewSeen: null,
  pencilEraserEnabled: true,
  applePencilSeen: false,
  toolbarStyle: 'bare',
  toolDrawerEnabled: false,
  screenshotEnabled: true,
};
const VERSION_15 = {
  ...VERSION_14,
  version: 15,
  aiCustomizationEnabled: false,
  autoSaveAiEnabled: true,
};
// Schema 16 stops saving the paint, which every launch resets.
const { selectedColor: _paint, customColors: _paints, ...KEPT_15 } = VERSION_15;
const VERSION_16 = { ...KEPT_15, version: 16 };

describe('settings schema 15', () => {
  it('migrates a version 14 record to the shipping AI Art defaults, keeping every choice', () => {
    expect(parseSoundSettings(JSON.stringify(VERSION_14))).toEqual({
      ...VERSION_16,
      aiCustomizationEnabled: true,
      autoSaveAiEnabled: false,
    });
  });

  it('carries a version 1 record through every step to the AI Art defaults', () => {
    expect(parseSoundSettings('{"version":1,"soundEnabled":false}')).toMatchObject({
      version: 16,
      soundEnabled: false,
      aiEnabled: false,
      aiCustomizationEnabled: true,
      autoSaveAiEnabled: false,
    });
  });

  it('reads a version 15 record without its paint, and a version 16 record exactly', () => {
    expect(parseSoundSettings(JSON.stringify(VERSION_15))).toEqual(VERSION_16);
    expect(parseSoundSettings(JSON.stringify(VERSION_16))).toEqual(VERSION_16);
  });

  it('refuses the AI Art switches in a version 14 record, and their absence or a bad value in 15', () => {
    expect(() =>
      parseSoundSettings(
        JSON.stringify({ ...VERSION_14, aiCustomizationEnabled: true, autoSaveAiEnabled: false })
      )
    ).toThrow('not in the saved format');
    const { autoSaveAiEnabled: _dropped, ...missing } = VERSION_15;
    expect(() => parseSoundSettings(JSON.stringify(missing))).toThrow(
      'AI Art choices are invalid.'
    );
    expect(() =>
      parseSoundSettings(JSON.stringify({ ...VERSION_15, aiCustomizationEnabled: 'true' }))
    ).toThrow('AI Art choices are invalid.');
  });

  it('persists each AI Art switch and reads it back', async () => {
    let stored = JSON.stringify(VERSION_14);
    const storage = { read: async () => stored, write: vi.fn(async (next) => (stored = next)) };
    const owner = createSoundSettings(storage, () => {});
    await owner.load();
    await owner.setAiCustomizationEnabled(false);
    await owner.setAutoSaveAiEnabled(true);
    expect(JSON.parse(stored)).toEqual({
      ...VERSION_16,
      aiCustomizationEnabled: false,
      autoSaveAiEnabled: true,
    });
    await expect(owner.setAutoSaveAiEnabled('yes')).rejects.toThrow('AI Art choice is invalid.');
  });
});

// Every grown-up check on: nothing below may pass one without asking.
const ALWAYS = {
  ai: 'always',
  imageReport: 'always',
  externalLinks: 'always',
  feedback: 'always',
  parentCenter: 'always',
};
async function product(aiEnabled = false, write = async () => {}) {
  let stored = JSON.stringify({ ...VERSION_15, aiEnabled, parentPolicies: ALWAYS });
  const storage = {
    read: async () => stored,
    write: vi.fn(async (next) => {
      await write(next);
      stored = next;
    }),
  };
  const owner = createDrawingProduct(storage, () => {});
  await owner.settings.load();
  return { owner, storage, stored: () => JSON.parse(stored) };
}

describe('the AI Art master switch', () => {
  it.each([true, false])(
    'turns %s at once, with no grown-up check, as shipping does',
    async (next) => {
      const f = await product(!next);
      await f.owner.setAiEnabled(next);
      expect(f.stored().aiEnabled).toBe(next);
      expect(f.owner.port.consent().enabled).toBe(next);
      // Negative control: the Parent Center check the switch used to wait behind stays shut.
      expect(f.owner.gate.getState().open).toBe(false);
      expect(f.owner.getState().settings.message).toBe('AI Art choice saved.');
    }
  );

  it('keeps a failed save and its retry with AI Art, not Parent Center', async () => {
    let fail = true;
    const f = await product(false, async () => {
      if (fail) throw new Error('disk full');
    });
    await f.owner.setAiEnabled(true);
    expect(f.owner.getState().settings).toMatchObject({
      aiEnabled: false,
      saved: false,
      message: 'The AI Art choice was not saved. AI stays as it was. Retry saving.',
    });
    expect(f.owner.settings.aiSaveFailed()).toBe(true);
    fail = false;
    await f.owner.settings.retryAiSave();
    expect(f.stored().aiEnabled).toBe(true);
    expect(f.owner.settings.aiSaveFailed()).toBe(false);
    expect(f.owner.gate.getState().open).toBe(false);
  });

  it("leaves a failed Parent Center policy to Parent Center's own retry", async () => {
    let fail = true;
    const f = await product(false, async () => {
      if (fail) throw new Error('disk full');
    });
    await f.owner.settings.setParentPreferences({
      aiEnabled: false,
      parentPolicies: { ...ALWAYS, feedback: 'session' },
    });
    expect(f.owner.settings.aiSaveFailed()).toBe(false);
    fail = false;
    await f.owner.settings.retryAiSave();
    expect(f.storage.write).toHaveBeenCalledOnce();
  });
});

function json(body, init) {
  return new Response(JSON.stringify(body), init);
}
async function aiFixture({ consent = true, saved = {}, verify } = {}) {
  const f = await product(consent);
  const vault = {
    read: vi.fn(async (kind) => saved[kind] ?? null),
    write: vi.fn(async (kind, value) => void (saved[kind] = value)),
    remove: vi.fn(async (kind) => void delete saved[kind]),
    installationId: vi.fn(async () => 'a'.repeat(64)),
  };
  const transport = vi.fn(async (request) => {
    if (request.path === '/api/free-generation-grant')
      return json({ ok: true, remaining: 4, limit: FREE_LIMIT });
    return verify(request);
  });
  const owner = createNativeAi({
    parent: f.owner.port,
    vault,
    storage: nativeAiBoundary().aiStorage,
    transport,
    prepare: vi.fn(async () => ({
      bytes: Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10),
      originalId: 'picture-1-fixture',
      originalModel: '{}',
    })),
    admit: async () => {},
  });
  return { ...f, ai: owner, vault, transport };
}

describe("Settings' read of the AI credential and allowance", () => {
  it('reads the saved credential but asks for no allowance while AI is off', async () => {
    const f = await aiFixture({ consent: false });
    await f.ai.inspect();
    expect(f.ai.getState()).toMatchObject({ credential: 'free', saved: null, checking: false });
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.owner.gate.getState().open).toBe(false);
  });

  it('reads the free allowance with no grown-up check while AI is on', async () => {
    const f = await aiFixture();
    await f.ai.inspect();
    expect(f.ai.getState()).toMatchObject({ credential: 'free', remaining: 4, busy: false });
    expect(f.transport).toHaveBeenCalledOnce();
    expect(f.owner.gate.getState().open).toBe(false);
  });

  it('shows a saved key masked and a saved code in full, asking the network for neither', async () => {
    const key = await aiFixture({ saved: { byok: 'sk-proj-abcd1234' } });
    await key.ai.inspect();
    expect(key.ai.getState()).toMatchObject({ credential: 'byok', saved: `${'*'.repeat(12)}1234` });
    const code = await aiFixture({ saved: { managed: 'family-code' } });
    await code.ai.inspect();
    expect(code.ai.getState()).toMatchObject({ credential: 'managed', saved: 'family-code' });
    expect(key.transport).not.toHaveBeenCalled();
    expect(code.transport).not.toHaveBeenCalled();
  });
});

describe('saving a credential from Settings', () => {
  async function save(verify, kind = 'byok', value = 'sk-fixture') {
    storage.requestPersistentStorage.mockClear();
    const f = await aiFixture({ verify });
    await f.ai.setup(kind, value);
    await vi.waitFor(() => expect(f.ai.getState().credentialResult).not.toBeNull());
    return f;
  }

  it('keeps an accepted key in the vault and says so, with no grown-up check', async () => {
    const f = await save(async () => json({ ok: true }));
    expect(f.owner.gate.getState().open).toBe(false);
    expect(f.vault.write).toHaveBeenCalledExactlyOnceWith('byok', 'sk-fixture');
    expect(f.ai.getState()).toMatchObject({
      credential: 'byok',
      saved: `${'*'.repeat(6)}ture`,
      credentialResult: { id: 1, kind: 'byok', outcome: 'accepted' },
    });
    // Shipping asks the browser once to keep the origin's storage after an explicit save
    // (ADR-0128). Negative control: a save that skips the request fails here.
    expect(storage.requestPersistentStorage).toHaveBeenCalledOnce();
  });

  it("passes on the server's own words for a refused key and keeps nothing", async () => {
    const f = await save(async () =>
      json({ ok: false, error: 'That key could not authenticate with OpenAI.' })
    );
    expect(f.vault.write).not.toHaveBeenCalled();
    expect(storage.requestPersistentStorage).not.toHaveBeenCalled();
    expect(f.ai.getState().credentialResult).toMatchObject({
      outcome: 'invalid',
      detail: 'That key could not authenticate with OpenAI.',
    });
  });

  it('tells a check that got no answer apart from a refusal', async () => {
    const f = await save(async () =>
      json(
        { ok: false, code: 'KEY_CHECK_UNAVAILABLE', error: "We couldn't check that key just now." },
        { status: 503 }
      )
    );
    expect(f.ai.getState().credentialResult).toMatchObject({
      outcome: 'checkUnavailable',
      detail: "We couldn't check that key just now.",
    });
  });

  it('reports an unreachable server', async () => {
    const f = await save(
      async () => {
        throw new TypeError('offline');
      },
      'managed',
      'family-code'
    );
    expect(f.ai.getState().credentialResult).toMatchObject({
      kind: 'managed',
      outcome: 'unreachable',
    });
  });

  it('reports a key the vault would not keep', async () => {
    const f = await aiFixture({ verify: async () => json({ ok: true }) });
    f.vault.write.mockRejectedValueOnce(new Error('keystore'));
    await f.ai.setup('byok', 'sk-fixture');
    await vi.waitFor(() =>
      expect(f.ai.getState().credentialResult).toMatchObject({ outcome: 'saveFailed' })
    );
  });

  it('forgets a saved code and reports it', async () => {
    const f = await aiFixture({ saved: { managed: 'family-code' } });
    await f.ai.removeCredential('managed');
    await vi.waitFor(() =>
      expect(f.ai.getState().credentialResult).toMatchObject({ outcome: 'forgotten' })
    );
    expect(f.vault.remove).toHaveBeenCalledExactlyOnceWith('managed');
    expect(f.ai.getState()).toMatchObject({ credential: 'free', saved: null });
    expect(f.owner.gate.getState().open).toBe(false);
  });

  it('changes nothing while AI is off', async () => {
    const f = await aiFixture({ consent: false, verify: async () => json({ ok: true }) });
    await f.ai.setup('byok', 'sk-fixture');
    await f.ai.removeCredential('byok');
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.vault.write).not.toHaveBeenCalled();
    expect(f.vault.remove).not.toHaveBeenCalled();
  });

  it('still asks the grown-up check before a drawing is sent', async () => {
    const f = await save(async () => json({ ok: true }));
    const sent = () => f.transport.mock.calls.filter(([r]) => r.path === '/api/generate-image');
    f.ai.open();
    await f.ai.generate();
    expect(f.owner.gate.getState()).toMatchObject({ open: true, feature: 'ai' });
    expect(sent()).toHaveLength(0);
    f.owner.gate.cancel('ai');
    expect(sent()).toHaveLength(0);
  });

  it('drops a check that a switch-off overtakes', async () => {
    let finish;
    const f = await aiFixture({
      verify: () => new Promise((resolve) => (finish = () => resolve(json({ ok: true })))),
    });
    const work = f.ai.setup('byok', 'sk-fixture');
    await vi.waitFor(() => expect(finish).toBeDefined());
    await f.owner.setAiEnabled(false);
    finish();
    await work;
    expect(f.vault.write).not.toHaveBeenCalled();
  });

  // A save that a switch-off overtakes while the vault writes is no longer the parent's opt-in, so
  // it asks the browser for nothing. Negative control: a request made before the ownership check
  // fails here.
  it('asks for persistent storage only for a save that still owns the session', async () => {
    storage.requestPersistentStorage.mockClear();
    let written;
    const f = await aiFixture({ verify: async () => json({ ok: true }) });
    f.vault.write.mockImplementationOnce(() => new Promise((resolve) => (written = resolve)));
    const work = f.ai.setup('byok', 'sk-fixture');
    await vi.waitFor(() => expect(written).toBeDefined());
    await f.owner.setAiEnabled(false);
    written();
    await work;
    expect(storage.requestPersistentStorage).not.toHaveBeenCalled();
  });
});
