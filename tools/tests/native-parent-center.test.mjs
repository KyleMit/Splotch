import { describe, expect, it, vi } from 'vitest';
import {
  createParentGate,
  PARENT_GATE_SHAKE_MS,
} from '../../experiments/native-architecture/src/parentCenter/parentGate.ts';
import { createDrawingProduct } from '../../experiments/native-architecture/src/product/createDrawingProduct.ts';
import {
  createSoundSettings,
  parseSoundSettings,
} from '../../experiments/native-architecture/src/settings/soundSettings.ts';
import { createNativeFeedback } from '../../experiments/native-architecture/src/feedback/feedback.ts';
import {
  GATE_LOCKOUT_BASE_MS,
  GATE_LOCKOUT_MAX_MS,
  GATE_ESCALATION_QUIET_MS,
} from '../../experiments/native-architecture/src/feedback/gateLockout.ts';

const ALWAYS = {
  ai: 'always',
  imageReport: 'always',
  externalLinks: 'always',
  feedback: 'always',
  parentCenter: 'always',
};
function fixture(policies = ALWAYS) {
  let clock = 1000;
  const changes = [];
  const gate = createParentGate(
    () => policies,
    (next) => changes.push(next),
    () => clock,
    () => 0
  );
  return {
    gate,
    changes,
    advance(ms) {
      clock += ms;
    },
    setClock(value) {
      clock = value;
    },
  };
}
function solve(gate) {
  const { x, y } = gate.getState();
  gate.input(String(x * y));
  gate.answer();
}
function pending() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function productFixture() {
  const storage = { read: vi.fn(async () => null), write: vi.fn(async () => {}) };
  const owner = createDrawingProduct(storage, () => {});
  return { owner, storage };
}
describe('root Parent Center policy and lifetime', () => {
  it('migrates old settings without enabling AI and rejects malformed current policies', () => {
    const old = {
      version: 4,
      soundEnabled: false,
      strokeWidth: 'thin',
      eraserWidth: 'thick',
      selectedColor: 'Black',
      customColors: [],
      appearance: 'dark',
    };
    const current = parseSoundSettings(JSON.stringify(old));
    expect(current).toEqual({
      ...old,
      version: 13,
      saveOnDeleteEnabled: false,
      buttonScale: 100,
      reduceMotion: 'system',
      whatsNewSeen: null,
      pencilEraserEnabled: true,
      applePencilSeen: false,
      toolbarStyle: 'buttons',
      coloringBookEnabled: true,
      soundVolume: 50,
      drawingSoundEnabled: true,
      deleteSoundEnabled: true,
      undoButtonEnabled: true,
      strokeWidthControlEnabled: true,
      orientation: 'portrait',
      aiEnabled: false,
      parentPolicies: ALWAYS,
    });
    expect(() =>
      parseSoundSettings(
        JSON.stringify({ ...current, parentPolicies: { ...ALWAYS, external: 'never' } })
      )
    ).toThrow('Parent Center');
    expect(() => parseSoundSettings(JSON.stringify({ ...current, aiEnabled: 'true' }))).toThrow(
      'Parent Center'
    );
  });
  it.each([5, 6])(
    'preserves version %s policies while protecting image reports',
    async (version) => {
      const old = {
        version,
        soundEnabled: false,
        strokeWidth: 'thin',
        eraserWidth: 'thick',
        selectedColor: 'Black',
        customColors: [],
        appearance: 'dark',
        aiEnabled: true,
        parentPolicies: { ai: 'never', feedback: 'session', parentCenter: 'always' },
        ...(version === 6 ? { coloringBookEnabled: false } : {}),
      };
      const migrated = parseSoundSettings(JSON.stringify(old));
      expect(migrated).toMatchObject({
        version: 13,
        aiEnabled: true,
        parentPolicies: {
          ai: 'never',
          imageReport: 'always',
          externalLinks: 'always',
          feedback: 'session',
          parentCenter: 'always',
        },
        coloringBookEnabled: version === 5,
      });
      expect(() =>
        parseSoundSettings(
          JSON.stringify({
            ...old,
            parentPolicies: { ...old.parentPolicies, imageReport: 'never' },
          })
        )
      ).toThrow('Parent Center');
      const storage = { read: async () => JSON.stringify(old), write: vi.fn(async () => {}) };
      const owner = createSoundSettings(storage, () => {});
      await owner.load();
      await owner.setEnabled(true);
      expect(parseSoundSettings(storage.write.mock.calls[0][0])).toEqual({
        ...migrated,
        soundEnabled: true,
      });
      owner.dispose();
    }
  );
  it('persists and strictly restores the dedicated version 7 image-report policy', async () => {
    const f = productFixture();
    await f.owner.settings.load();
    f.owner.openParentCenter();
    solve(f.owner.gate);
    await f.owner.setPolicy('imageReport', 'session');
    const stored = f.storage.write.mock.calls[0][0];
    expect(parseSoundSettings(stored)).toMatchObject({
      version: 13,
      parentPolicies: { ...ALWAYS, imageReport: 'session' },
    });
    const current = JSON.parse(stored);
    const { imageReport, ...missing } = current.parentPolicies;
    expect(imageReport).toBe('session');
    expect(() =>
      parseSoundSettings(
        JSON.stringify({
          ...current,
          parentPolicies: missing,
        })
      )
    ).toThrow('Parent Center');
    expect(() =>
      parseSoundSettings(
        JSON.stringify({
          ...current,
          parentPolicies: { ...current.parentPolicies, imageReport: 'sometimes' },
        })
      )
    ).toThrow('Parent Center');
    f.owner.dispose();
  });
  it('requires AI consent and a separate image-report solve, then revokes proof when its policy changes', async () => {
    const f = productFixture();
    await f.owner.settings.load();
    const report = vi.fn();
    expect(f.owner.port.request('imageReport', report)).toBe(false);
    expect(report).not.toHaveBeenCalled();
    f.owner.openParentCenter();
    solve(f.owner.gate);
    await f.owner.setAiEnabled(true);
    await f.owner.setPolicy('ai', 'session');
    f.owner.closeParentCenter();
    const ai = vi.fn();
    f.owner.port.request('ai', ai);
    solve(f.owner.gate);
    expect(ai).toHaveBeenCalledOnce();
    f.owner.port.request('imageReport', report);
    expect(f.owner.gate.getState()).toMatchObject({ open: true, feature: 'imageReport' });
    expect(report).not.toHaveBeenCalled();
    solve(f.owner.gate);
    const proof = report.mock.calls[0][0];
    expect(proof.valid()).toBe(true);
    const epoch = f.owner.port.consent().epoch;
    await f.owner.settings.setParentPreferences({
      aiEnabled: true,
      parentPolicies: { ...f.owner.getState().settings.parentPolicies, imageReport: 'session' },
    });
    expect(proof.valid()).toBe(false);
    expect(f.owner.port.consent().epoch).toBeGreaterThan(epoch);
    f.owner.openParentCenter();
    solve(f.owner.gate);
    await f.owner.setAiEnabled(false);
    expect(f.owner.port.request('imageReport', report)).toBe(false);
    expect(report).toHaveBeenCalledOnce();
    f.owner.dispose();
  });
  it('requires Parent Center authorization and confirmed persistence before enabling AI or relaxing a policy', async () => {
    const f = productFixture();
    await f.owner.settings.load();
    await f.owner.setAiEnabled(true);
    expect(f.storage.write).not.toHaveBeenCalled();
    f.owner.openParentCenter();
    solve(f.owner.gate);
    const write = pending();
    f.storage.write.mockReturnValueOnce(write.promise);
    const work = f.owner.setAiEnabled(true);
    expect(f.owner.port.consent().enabled).toBe(false);
    write.reject(new Error('disk full'));
    await work;
    expect(f.owner.port.consent().enabled).toBe(false);
    f.owner.closeParentCenter();
    await f.owner.settings.retrySave();
    expect(f.storage.write).toHaveBeenCalledTimes(1);
    await f.owner.retryParentSave();
    expect(f.storage.write).toHaveBeenCalledTimes(1);
    f.owner.openParentCenter();
    solve(f.owner.gate);
    await f.owner.retryParentSave();
    expect(f.owner.port.consent().enabled).toBe(true);
    await f.owner.setPolicy('parentCenter', 'never');
    expect(f.owner.getState().confirmNever).toBe(true);
    expect(f.owner.getState().settings.parentPolicies.parentCenter).toBe('always');
    await f.owner.setPolicy('parentCenter', 'never', true);
    expect(f.owner.getState().settings.parentPolicies.parentCenter).toBe('never');
    f.owner.dispose();
    expect(f.owner.port.consent().enabled).toBe(false);
  });
  it('retains conservative protection after failed reads and never overwrites unread settings', async () => {
    const f = productFixture();
    f.storage.read.mockRejectedValueOnce(new Error('permission'));
    await f.owner.settings.load();
    f.owner.openParentCenter();
    solve(f.owner.gate);
    await f.owner.setAiEnabled(true);
    await f.owner.settings.setAppearance('dark');
    await f.owner.settings.retrySave();
    expect(f.storage.write).not.toHaveBeenCalled();
    expect(f.owner.getState().settings).toMatchObject({
      aiEnabled: false,
      parentPolicies: ALWAYS,
      appearance: 'dark',
    });
    await f.owner.settings.retryRead();
    await f.owner.setAiEnabled(true);
    expect(f.storage.write).toHaveBeenCalledOnce();
  });
  it('isolates session solves, rejects competing intents and retargets without granting the abandoned operation', () => {
    const f = fixture({ ...ALWAYS, ai: 'session' });
    const ai = vi.fn();
    const feedback = vi.fn();
    expect(f.gate.request('ai', ai)).toBe(true);
    expect(f.gate.request('feedback', feedback)).toBe(false);
    solve(f.gate);
    expect(ai).toHaveBeenCalledOnce();
    const proof = ai.mock.calls[0][0];
    expect(proof.valid()).toBe(true);
    f.gate.request('ai', ai);
    expect(ai).toHaveBeenCalledTimes(2);
    expect(proof.valid()).toBe(false);
    f.gate.request('feedback', feedback);
    expect(f.gate.getState().open).toBe(true);
    const challenge = f.gate.getState();
    const parent = vi.fn();
    f.gate.retarget(parent);
    expect(f.gate.getState()).toMatchObject({
      x: challenge.x,
      y: challenge.y,
      feature: 'parentCenter',
    });
    solve(f.gate);
    expect(feedback).not.toHaveBeenCalled();
    expect(parent).toHaveBeenCalledOnce();
    f.gate.resetSessions();
    f.gate.request('ai', ai);
    expect(f.gate.getState().open).toBe(true);
  });
  it('counts early and overflow checks, suppresses shaking input and preserves global lockout across dismissal and features', () => {
    const f = fixture();
    f.gate.request('ai', vi.fn());
    f.gate.answer();
    expect(f.gate.getState().shaking).toBe(true);
    f.gate.input('9');
    expect(f.gate.getState().input).toBe('');
    f.advance(PARENT_GATE_SHAKE_MS);
    f.gate.input('99');
    f.advance(PARENT_GATE_SHAKE_MS);
    f.gate.answer();
    expect(f.gate.getState().locked).toBe(true);
    f.gate.dismiss();
    f.gate.request('feedback', vi.fn());
    expect(f.gate.getState().locked).toBe(true);
    const announcement = f.gate.getState().announcementId;
    f.advance(1000);
    f.gate.tick();
    expect(f.gate.getState().announcementId).toBe(announcement);
    f.setClock(-1000000);
    f.gate.tick();
    f.advance(GATE_LOCKOUT_MAX_MS);
    f.gate.tick();
    expect(f.gate.getState().locked).toBe(false);
    f.advance(GATE_ESCALATION_QUIET_MS);
    for (let index = 0; index < 3; index += 1) {
      f.gate.answer();
      f.advance(PARENT_GATE_SHAKE_MS);
    }
    f.advance(GATE_LOCKOUT_BASE_MS);
    f.gate.tick();
    expect(f.gate.getState().locked).toBe(false);
  });
  it('gates actual Feedback Send with immutable preview, cancels edits, and leaves the old policy writer inactive', async () => {
    const f = productFixture();
    await f.owner.settings.load();
    const transport = vi.fn(async () => new Response('{"ok":true}'));
    const policyStorage = { read: vi.fn(), write: vi.fn() };
    const feedback = createNativeFeedback({
      transport,
      device: () => ({}),
      offline: () => false,
      policyStorage,
      parent: f.owner.port,
    });
    await feedback.loadPolicy();
    feedback.open();
    feedback.setMessage('A useful report');
    feedback.preview();
    feedback.send();
    expect(transport).not.toHaveBeenCalled();
    feedback.setMessage('A changed report');
    solve(f.owner.gate);
    expect(transport).not.toHaveBeenCalled();
    feedback.preview();
    feedback.send();
    f.owner.retargetParentCenter();
    solve(f.owner.gate);
    expect(transport).not.toHaveBeenCalled();
    expect(f.owner.getState().parentCenterOpen).toBe(true);
    f.owner.closeParentCenter();
    feedback.send();
    solve(f.owner.gate);
    await vi.waitFor(() => expect(transport).toHaveBeenCalledOnce());
    expect(Object.isFrozen(transport.mock.calls[0][0])).toBe(true);
    feedback.changePolicy('never');
    expect(policyStorage.read).not.toHaveBeenCalled();
    expect(policyStorage.write).not.toHaveBeenCalled();
    feedback.dispose();
    f.owner.dispose();
  });
  it('revokes an individually disposed Feedback intent without relying on whole-product teardown', async () => {
    const f = productFixture();
    await f.owner.settings.load();
    const transport = vi.fn();
    const feedback = createNativeFeedback({
      transport,
      device: () => ({}),
      offline: () => false,
      policyStorage: { read: vi.fn(), write: vi.fn() },
      parent: f.owner.port,
    });
    await feedback.loadPolicy();
    feedback.open();
    feedback.setMessage('Disposed report');
    feedback.preview();
    feedback.send();
    expect(f.owner.gate.getState().open).toBe(true);
    feedback.dispose();
    expect(f.owner.gate.getState().open).toBe(false);
    solve(f.owner.gate);
    expect(transport).not.toHaveBeenCalled();
    f.owner.openParentCenter();
    expect(f.owner.gate.getState().feature).toBe('parentCenter');
    solve(f.owner.gate);
    expect(f.owner.getState().parentCenterOpen).toBe(true);
    f.owner.dispose();
  });
});
