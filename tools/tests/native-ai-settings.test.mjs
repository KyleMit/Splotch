import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createDrawingProduct } from '../../experiments/native-architecture/src/product/createDrawingProduct.ts';
import { createNativeAi } from '../../experiments/native-architecture/src/ai/generation.ts';
import { classifyCredential } from '../../experiments/native-architecture/src/ai/credentialKind.ts';
import { maskSecret } from '../../experiments/native-architecture/src/ai/credentials.ts';
import { FREE_LIMIT } from '../../experiments/native-architecture/src/ai/contract.ts';
import { DEFAULT_AI_PREFERENCES } from '../../experiments/native-architecture/src/settings/aiPreferences.ts';
import {
  AI_AUTO_SAVE_HELP,
  AI_SETTINGS_COPY,
  AI_VALUE_PROP_COPY,
  KEY_MESSAGES,
  KEY_STORAGE_NOTE,
  OPENAI_KEY_HOWTO_COPY,
  valuePropClaims,
} from '../../experiments/native-architecture/src/settings/aiSettingsCopy.ts';
import {
  createSoundSettings,
  parseSoundSettings,
} from '../../experiments/native-architecture/src/settings/soundSettings.ts';
import { FREE_GENERATION_LIMIT } from '../../web/src/lib/freeGenerations.ts';
import { nativeAiBoundary } from './native-ai-boundary.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const flat = (source) => source.replace(/\s+/g, ' ');
const SHIPPING = {
  copy: read('web/src/lib/components/settings/aiSettingsCopy.ts'),
  manager: read('web/src/lib/components/settings/AiKeyManager.svelte'),
  valueProp: read('web/src/lib/components/settings/AiValueProp.svelte'),
  howTo: read('web/src/lib/components/settings/OpenAiKeyHowTo.svelte'),
  sectionCss: read('web/src/lib/components/SettingsModal.ai.css'),
  settings: read('web/src/lib/state/settings.svelte.ts'),
  tokens: read('web/src/lib/design/tokens.ts'),
};
const NATIVE = {
  manager: read('experiments/native-architecture/src/rsdDrawing/RsdAiKeyManager.tsx'),
  valueProp: read('experiments/native-architecture/src/rsdDrawing/RsdAiValueProp.tsx'),
  howTo: read('experiments/native-architecture/src/rsdDrawing/RsdOpenAiKeyHowTo.tsx'),
  geometry: read('experiments/native-architecture/src/rsdDrawing/modalGeometry.ts'),
  strictCss: read('experiments/native-architecture/src/strict.css'),
  hostedPages: read('experiments/native-architecture/src/settings/hostedPages.ts'),
};
// A module-scope literal of a native port, as the StyleX compile needs it written.
function literal(source, name) {
  const match = new RegExp(`const ${name} = ([^;]+);`).exec(source);
  if (!match) throw new Error(`No ${name}`);
  return Function(`return (${match[1].replace(/ as const$/, '')});`)();
}

describe('Settings › AI Art against shipping', () => {
  it('stores the feature switches with the shipping fallbacks', () => {
    expect(SHIPPING.settings).toContain(
      `aiCustomizationEnabled: [STORAGE_KEYS.aiCustomizationEnabled, ${DEFAULT_AI_PREFERENCES.aiCustomizationEnabled}]`
    );
    expect(SHIPPING.settings).toContain(
      `autoSaveAiEnabled: [STORAGE_KEYS.autoSaveAi, ${DEFAULT_AI_PREFERENCES.autoSaveAiEnabled}]`
    );
    expect(FREE_LIMIT).toBe(FREE_GENERATION_LIMIT);
  });

  it('words the switches as shipping does', () => {
    expect(SHIPPING.copy).toContain(`AI_CREATE_LABEL = '${AI_SETTINGS_COPY.create}'`);
    expect(SHIPPING.copy).toContain(`off: '${AI_SETTINGS_COPY.createHelp.off}'`);
    expect(SHIPPING.copy).toContain(`on: '${AI_SETTINGS_COPY.createHelp.on}'`);
    expect(SHIPPING.copy).toContain(`AI_CUSTOMIZATION_LABEL = '${AI_SETTINGS_COPY.customization}'`);
    expect(flat(SHIPPING.copy)).toContain(`'${AI_SETTINGS_COPY.customizationHelp}'`);
    expect(SHIPPING.copy).toContain(`AI_AUTO_SAVE_LABEL = '${AI_SETTINGS_COPY.autoSave}'`);
    expect(SHIPPING.copy).toContain(`return '${AI_AUTO_SAVE_HELP.native}'`);
    expect(SHIPPING.copy).toContain(`: '${AI_AUTO_SAVE_HELP.web}'`);
  });

  it("words the key manager's text as AiKeyManager.svelte does", () => {
    const manager = flat(SHIPPING.manager);
    const limited = (text) => text.replace(String(FREE_LIMIT), '{FREE_GENERATION_LIMIT}');
    for (const [name, text] of Object.entries(AI_SETTINGS_COPY)) {
      if (typeof text !== 'string' || /^(create|customization|autoSave)/.test(name)) continue;
      expect(manager, name).toContain(limited(text).trim());
    }
    expect(manager).toContain(
      "free AI {freeGrant.remaining === 1 ? 'creation' : 'creations'} left."
    );
    for (const group of [KEY_MESSAGES.accepted, KEY_MESSAGES.saveFailed, KEY_MESSAGES.forgetFailed])
      for (const text of Object.values(group)) expect(manager).toContain(text);
    for (const text of Object.values(KEY_MESSAGES.invalid)) expect(manager).toContain(text);
    for (const text of Object.values(KEY_STORAGE_NOTE)) expect(manager).toContain(text);
    expect(SHIPPING.manager).toContain('NETWORK_ERROR_MESSAGE');
  });

  it('words the explainer as AiValueProp.svelte does', () => {
    const valueProp = flat(SHIPPING.valueProp);
    expect(valueProp).toContain(AI_VALUE_PROP_COPY.title);
    expect(valueProp).toContain(AI_VALUE_PROP_COPY.body);
    for (const step of AI_VALUE_PROP_COPY.steps) {
      expect(valueProp).toContain(`number: ${step.number}, caption: '${step.caption}'`);
      expect(valueProp).toContain(step.alt);
    }
    const shippingClaim = (text) =>
      text
        .replace(String(FREE_LIMIT), '{FREE_GENERATION_LIMIT}')
        .replace(
          /You have \d+ free pictures?/,
          "You have {freeRemaining} free {freeRemaining === 1 ? 'picture' : 'pictures'}"
        );
    for (const [credential, remaining] of [
      ['managed', FREE_LIMIT],
      ['byok', FREE_LIMIT],
      ['none', 0],
      ['none', 3],
      ['none', FREE_LIMIT],
    ])
      for (const claim of valuePropClaims(credential, remaining))
        expect(valueProp, claim).toContain(shippingClaim(claim));
  });

  it('words and links the how-to as OpenAiKeyHowTo.svelte does', () => {
    const howTo = flat(SHIPPING.howTo);
    for (const [name, text] of Object.entries(OPENAI_KEY_HOWTO_COPY))
      expect(howTo, name).toContain(text.trim());
    expect(SHIPPING.howTo).toContain(
      `href="${/openAiKeys: '([^']+)'/.exec(NATIVE.hostedPages)[1]}"`
    );
    expect(SHIPPING.howTo).toContain('use:parentalGateLink');
  });

  it('carries the shipping geometry', () => {
    expect(SHIPPING.sectionCss).toContain(
      `--ai-section-card-height: ${literal(NATIVE.geometry, 'AI_SECTION_CARD_HEIGHT_PX')}px;`
    );
    const mono = /input\[readonly\] \{\s*font-family: ([^;]+);/.exec(NATIVE.strictCss)[1];
    expect(SHIPPING.tokens).toContain(`fontMono: '${mono}'`);
    const css = flat(SHIPPING.manager);
    const manager = (name) => literal(NATIVE.manager, name);
    expect(css).toContain(`margin: 0 0 ${manager('INTRO_BOTTOM_PX')}px;`);
    expect(css).toContain(`line-height: ${manager('INTRO_LINE_HEIGHT')};`);
    expect(css).toContain(`margin-bottom: ${manager('LABEL_BOTTOM_PX')}px;`);
    expect(css).toContain(`gap: ${manager('ROW_GAP_PX')}px;`);
    const input = manager('INPUT_PADDING_PX');
    expect(css).toContain(`padding: ${input.block}px ${input.inline}px;`);
    expect(css).toContain(`letter-spacing: ${manager('SAVED_LETTER_SPACING_PX')}px;`);
    expect(css).toContain(`margin: ${manager('NOTE_TOP_PX')}px 0 0;`);
    expect(css).toContain(`margin-top: ${manager('ACTIVE_NOTE_TOP_PX')}px;`);
    expect(css).toContain(`gap: ${manager('NOTE_GAP_PX')}px;`);
    expect(css).toContain(`line-height: ${manager('NOTE_LINE_HEIGHT')};`);
    expect(css).toContain(`width: ${manager('NOTE_ICON_PX')}px;`);
    expect(css).toContain(`margin-top: ${manager('NOTE_ICON_TOP_PX')}px;`);

    const prop = flat(SHIPPING.valueProp);
    const valueProp = (name) => literal(NATIVE.valueProp, name);
    expect(prop).toContain(`gap: ${valueProp('STEP_GAP_PX')}px;`);
    expect(valueProp('IMAGE_ASPECT')).toBe(278 / 213);
    expect(prop).toContain('aspect-ratio: 278 / 213;');
    expect(prop).toContain(`top: ${valueProp('BADGE_INSET_PX')}px;`);
    expect(prop).toContain(`width: ${valueProp('BADGE_PX')}px;`);
    expect(prop).toContain(`width: ${valueProp('BADGE_PHONE_PX')}px;`);
    expect(prop).toContain(`line-height: ${valueProp('BODY_LINE_HEIGHT')};`);
    expect(prop).toContain(`line-height: ${valueProp('CAPTION_LINE_HEIGHT')};`);
    expect(prop).toContain(`line-height: ${valueProp('CLAIM_LINE_HEIGHT')};`);
    expect(prop).toContain(`grid-template-columns: ${valueProp('CLAIM_ICON_COLUMN_PX')}px 1fr;`);
    expect(prop).toContain(`width: ${valueProp('CLAIM_ICON_PX')}px;`);
    expect(prop).toContain(`margin-top: ${valueProp('CLAIM_ICON_TOP_PX')}px;`);
    expect(prop).toContain(`@media (max-width: ${valueProp('PHONE_MAX_WIDTH_PX')}px)`);

    const how = flat(SHIPPING.howTo);
    const howTo = (name) => literal(NATIVE.howTo, name);
    expect(how).toContain(`margin: 0 0 ${howTo('HOWTO_BOTTOM_PX')}px;`);
    const summary = howTo('SUMMARY_PADDING_PX');
    expect(how).toContain(`padding: ${summary.block}px ${summary.inline}px;`);
    const list = howTo('LIST_PADDING_PX');
    expect(how).toContain(`padding: 0 ${list.inline}px ${list.bottom}px ${list.start}px;`);
    expect(how).toContain(`line-height: ${howTo('LIST_LINE_HEIGHT')};`);
    const code = howTo('CODE_PADDING_PX');
    expect(how).toContain(`padding: ${code.block}px ${code.inline}px;`);
    const note = howTo('NOTE_PADDING_PX');
    expect(how).toContain(`padding: 0 ${note.inline}px ${note.bottom}px;`);
  });

  it('bundles the shipping step illustrations byte for byte', () => {
    for (const step of [1, 2, 3])
      for (const theme of ['light', 'dark']) {
        const name = `step-${step}.${theme}.webp`;
        const bundled = readFileSync(
          new URL(
            `../../experiments/native-architecture/assets/ai-value-prop/${name}`,
            import.meta.url
          )
        );
        const original = readFileSync(
          new URL(`../../web/static/ai-value-prop/${name}`, import.meta.url)
        );
        expect(bundled.equals(original), name).toBe(true);
      }
  });

  it('masks all but the last four characters, as shipping does', () => {
    expect(maskSecret('')).toBe('');
    expect(maskSecret('abc')).toBe('***');
    expect(maskSecret('sk-proj-abcd1234')).toBe(`${'*'.repeat(12)}1234`);
    expect(SHIPPING.manager).toContain("'*'.repeat(value.length - 4) + value.slice(-4)");
  });

  it('tells a key from an access code by the shipping prefixes', () => {
    expect(classifyCredential('sk-proj-1')).toBe('byok');
    expect(classifyCredential('sk-1')).toBe('byok');
    expect(classifyCredential('family-code')).toBe('managed');
    expect(classifyCredential('AIzaFixture')).toBe('retiredGeminiKey');
    expect(classifyCredential('AQ.Fixture')).toBe('retiredGeminiKey');
  });
});

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

describe('settings schema 15', () => {
  it('migrates a version 14 record to the shipping AI Art defaults, keeping every choice', () => {
    expect(parseSoundSettings(JSON.stringify(VERSION_14))).toEqual({
      ...VERSION_14,
      version: 15,
      aiCustomizationEnabled: true,
      autoSaveAiEnabled: false,
    });
  });

  it('carries a version 1 record through every step to the AI Art defaults', () => {
    expect(parseSoundSettings('{"version":1,"soundEnabled":false}')).toMatchObject({
      version: 15,
      soundEnabled: false,
      aiEnabled: false,
      aiCustomizationEnabled: true,
      autoSaveAiEnabled: false,
    });
  });

  it('reads a version 15 record exactly', () => {
    expect(parseSoundSettings(JSON.stringify(VERSION_15))).toEqual(VERSION_15);
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
      ...VERSION_15,
      aiCustomizationEnabled: false,
      autoSaveAiEnabled: true,
    });
    await expect(owner.setAutoSaveAiEnabled('yes')).rejects.toThrow('AI Art choice is invalid.');
  });
});

function solve(gate) {
  const { x, y } = gate.getState();
  gate.input(String(x * y));
  gate.answer();
}
const NEVER = { ai: 'never', imageReport: 'always', externalLinks: 'always', feedback: 'always' };
async function product(parentCenter = 'always', aiEnabled = false) {
  const record = {
    ...VERSION_15,
    aiEnabled,
    parentPolicies: { ...NEVER, parentCenter },
  };
  let stored = JSON.stringify(record);
  const owner = createDrawingProduct(
    { read: async () => stored, write: async (next) => void (stored = next) },
    () => {}
  );
  await owner.settings.load();
  return { owner, stored: () => JSON.parse(stored) };
}

describe('the AI Art master switch', () => {
  it('applies at once while Parent Center asks for no check', async () => {
    const f = await product('never');
    f.owner.toggleAi(true);
    await vi.waitFor(() => expect(f.stored().aiEnabled).toBe(true));
    expect(f.owner.gate.getState().open).toBe(false);
  });

  it.each([true, false])('waits behind the Parent Center check to turn %s', async (next) => {
    const f = await product('always', !next);
    f.owner.toggleAi(next);
    // Negative control: without the check the choice never reaches storage.
    expect(f.owner.gate.getState()).toMatchObject({ open: true, feature: 'parentCenter' });
    await Promise.resolve();
    expect(f.stored().aiEnabled).toBe(!next);
    solve(f.owner.gate);
    await vi.waitFor(() => expect(f.stored().aiEnabled).toBe(next));
  });

  it('drops a check that is dismissed', async () => {
    const f = await product('always');
    f.owner.toggleAi(true);
    f.owner.gate.cancel('parentCenter');
    await Promise.resolve();
    expect(f.stored().aiEnabled).toBe(false);
  });
});

function json(body, init) {
  return new Response(JSON.stringify(body), init);
}
async function aiFixture({ consent = true, saved = {}, verify } = {}) {
  const f = await product('never', consent);
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
    prepare: vi.fn(),
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
    const f = await aiFixture({ verify });
    await f.ai.setup(kind, value);
    await vi.waitFor(() => expect(f.ai.getState().credentialResult).not.toBeNull());
    return f;
  }

  it('keeps an accepted key in the vault and says so', async () => {
    const f = await save(async () => json({ ok: true }));
    expect(f.vault.write).toHaveBeenCalledExactlyOnceWith('byok', 'sk-fixture');
    expect(f.ai.getState()).toMatchObject({
      credential: 'byok',
      saved: `${'*'.repeat(6)}ture`,
      credentialResult: { id: 1, kind: 'byok', outcome: 'accepted' },
    });
  });

  it("passes on the server's own words for a refused key and keeps nothing", async () => {
    const f = await save(async () =>
      json({ ok: false, error: 'That key could not authenticate with OpenAI.' })
    );
    expect(f.vault.write).not.toHaveBeenCalled();
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
  });
});
