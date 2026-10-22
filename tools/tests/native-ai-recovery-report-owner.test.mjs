import { afterEach, expect, it, vi } from 'vitest';
import { MAX_AI_REPORT_BYTES } from '../../src/ai/reportContract.ts';
import {
  fixture,
  disposeRecoveryReportOwners,
  CREATED,
  EXPIRES,
  INPUT,
  OUTPUT,
  TOKEN,
  URI,
} from './native-ai-recovery-report-owner-harness.mjs';
const CREDENTIAL_READ_TIMEOUT_MS = 1000;
afterEach(disposeRecoveryReportOwners);
it.each(['free', 'managed', 'byok'])(
  'reuses the exact original %s reference without pinning a new generation',
  async (kind) => {
    const f = await fixture(kind);
    await f.prepare();
    f.commitRefusal();
    expect(f.owner.adoptRecoveryRefusal(f.receipt(), f.confirmation(), f.proof())).toBe(true);
    expect(f.rawVault.pin).not.toHaveBeenCalled();
    f.owner.requestRefusal(f.receipt().journal.id);
    f.confirm();
    expect(f.state().preview.style).toBe('Clay');
    expect(f.state().preview).not.toHaveProperty('output');
    expect(f.transport).not.toHaveBeenCalled();
    await f.owner.send();
    expect(f.transport.mock.calls[0][0].headers['X-Report-Token']).toBe(TOKEN);
  }
);
it.each([
  ['nonce', (r) => ({ ...r, nonce: '9'.repeat(64) })],
  ['attempt', (r) => ({ ...r, recovery: { ...r.recovery, id: '9'.repeat(64) } })],
  ['creation', (r) => ({ ...r, journal: { ...r.journal, createdAt: CREATED + 1 } })],
  ['original id', (r) => ({ ...r, journal: { ...r.journal, originalId: 'picture-2-other' } })],
  ['original digest', (r) => ({ ...r, originalDigest: '9'.repeat(64) })],
  ['original revision', (r) => ({ ...r, originalRevision: 2 })],
  ['style', (r) => ({ ...r, journal: { ...r.journal, style: 'Felt' } })],
  ['input digest', (r) => ({ ...r, inputDigest: '9'.repeat(64) })],
  ['input length', (r) => ({ ...r, inputLength: r.inputLength + 1 })],
  [
    'credential',
    (r) => ({
      ...r,
      recovery: {
        ...r.recovery,
        credential: { ...r.recovery.credential, reference: '9'.repeat(64) },
      },
    }),
  ],
  [
    'credential kind',
    (r) => ({
      ...r,
      recovery: { ...r.recovery, credential: { ...r.recovery.credential, kind: 'managed' } },
    }),
  ],
  [
    'predecessor id',
    (r) => ({ ...r, recovery: { ...r.recovery, sourceHeld: { ...r.recovery.sourceHeld, id: 9 } } }),
  ],
  [
    'predecessor nonce',
    (r) => ({
      ...r,
      recovery: { ...r.recovery, sourceHeld: { ...r.recovery.sourceHeld, nonce: '9'.repeat(64) } },
    }),
  ],
  [
    'predecessor revision',
    (r) => ({
      ...r,
      recovery: { ...r.recovery, sourceHeld: { ...r.recovery.sourceHeld, revision: 3 } },
    }),
  ],
])('does not migrate pinned report context across changed %s', async (_, mutate) => {
  const f = await fixture();
  await f.prepare();
  f.commitRefusal(mutate);
  expect(f.owner.adoptRecoveryRefusal(f.receipt(), f.confirmation(), f.proof())).toBe(false);
  f.owner.requestRefusal(f.receipt().journal.id);
  expect(f.state().phase).toBe('unavailable');
  expect(f.parent.request).not.toHaveBeenCalled();
  expect(f.transport).not.toHaveBeenCalled();
});
it.each([
  { id: '9'.repeat(64) },
  { createdAt: CREATED + 1 },
  { expiresAt: EXPIRES + 1 },
  { token: null },
])('rejects mismatched checked report proof %j', async (change) => {
  const f = await fixture();
  await f.prepare();
  f.commitRefusal();
  expect(
    f.owner.adoptRecoveryRefusal(f.receipt(), f.confirmation(), { ...f.proof(), ...change })
  ).toBe(false);
  f.owner.requestRefusal(f.receipt().journal.id);
  expect(f.state().phase).toBe('unavailable');
});
it('does not accept a refusal token before terminal persistence or with picture evidence', async () => {
  const f = await fixture();
  await f.prepare();
  expect(f.owner.adoptRecoveryRefusal(f.receipt(), f.confirmation(), f.proof())).toBe(false);
  f.commitPicture();
  expect(f.owner.adoptRecoveryRefusal(f.receipt(), f.confirmation(), f.proof())).toBe(false);
  expect(f.transport).not.toHaveBeenCalled();
});
it.each(['managed', 'byok'])(
  'preserves tokenless authenticated %s picture reports',
  async (kind) => {
    const f = await fixture(kind);
    await f.prepare();
    f.commitPicture();
    f.owner.adoptRecoveryPicture(f.receipt(), OUTPUT, 'image/png', f.proof(null), URI);
    f.owner.request(URI);
    f.confirm();
    await f.owner.send();
    expect(f.state().phase).toBe('success');
    expect(f.transport.mock.calls[0][0].headers).not.toHaveProperty('X-Report-Token');
  }
);
it.each([null, 'invalid token'])(
  'requires valid signed proof for a free recovery picture %s',
  async (token) => {
    const f = await fixture();
    await f.prepare();
    f.commitPicture();
    f.owner.adoptRecoveryPicture(f.receipt(), OUTPUT, 'image/png', f.proof(token), URI);
    f.owner.request(URI);
    expect(f.state().phase).toBe('unavailable');
    expect(f.transport).not.toHaveBeenCalled();
  }
);
it.each(['managed', 'byok'])('rejects present malformed picture token for %s', async (kind) => {
  const f = await fixture(kind);
  await f.prepare();
  f.commitPicture();
  f.owner.adoptRecoveryPicture(f.receipt(), OUTPUT, 'image/png', f.proof('invalid token'), URI);
  f.owner.request(URI);
  expect(f.state().phase).toBe('unavailable');
});
it.each([
  ['bytes', (r) => r, () => INPUT, 'image/png', URI],
  ['mime', (r) => r, () => OUTPUT, 'image/jpeg', URI],
  ['uri', (r) => r, () => OUTPUT, 'image/png', 'file:///other.png'],
  [
    'retention',
    (r) => ({ ...r, recovery: { ...r.recovery, state: 'delivery-pinned' } }),
    () => OUTPUT,
    'image/png',
    URI,
  ],
  [
    'result digest',
    (r) => ({ ...r, resultDigest: '9'.repeat(64) }),
    () => OUTPUT,
    'image/png',
    URI,
  ],
  [
    'result length',
    (r) => ({ ...r, resultLength: OUTPUT.length + 1 }),
    () => OUTPUT,
    'image/png',
    URI,
  ],
])('rejects recovery picture with wrong %s', async (_, mutate, bytes, mime, uri) => {
  const f = await fixture();
  await f.prepare();
  f.commitPicture();
  f.replace(mutate(f.receipt()));
  f.owner.adoptRecoveryPicture(f.receipt(), bytes(), mime, f.proof(), uri);
  f.owner.request(uri);
  expect(f.state().phase).toBe('unavailable');
  expect(f.transport).not.toHaveBeenCalled();
});
it('captures immutable original bytes before original admission awaits', async () => {
  const f = await fixture();
  const bytes = INPUT.slice();
  let release;
  f.admit.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const preparing = f.prepare(bytes);
  bytes.fill(0);
  await vi.waitFor(() => expect(f.admit).toHaveBeenCalledOnce());
  release();
  await preparing;
  f.commitRefusal();
  expect(f.owner.adoptRecoveryRefusal(f.receipt(), f.confirmation(), f.proof())).toBe(true);
  f.owner.requestRefusal(f.receipt().journal.id);
  f.confirm();
  expect(f.state().preview.drawing).toBe(
    'data:image/png;base64,' + Buffer.from(INPUT).toString('base64')
  );
});
it.each(['receipt', 'permission', 'lease', 'close'])(
  'invalidates preparation after %s changes across admission await',
  async (kind) => {
    const f = await fixture();
    let release;
    f.admit.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const preparing = f.prepare();
    await vi.waitFor(() => expect(f.admit).toHaveBeenCalledOnce());
    if (kind === 'receipt') f.replace({ ...f.receipt(), revision: f.receipt().revision + 1 });
    if (kind === 'permission') f.revoke();
    if (kind === 'lease') await f.vault.remove('managed');
    if (kind === 'close') f.owner.cancel();
    release();
    await preparing;
    f.commitRefusal();
    expect(f.owner.adoptRecoveryRefusal(f.receipt(), f.confirmation(), f.proof())).toBe(false);
    expect(f.transport).not.toHaveBeenCalled();
  }
);
it('checks the current receipt again after referenced credential readback', async () => {
  const f = await fixture();
  let release;
  f.rawVault.readReferenced.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const preparing = f.prepare();
  await vi.waitFor(() => expect(f.rawVault.readReferenced).toHaveBeenCalledOnce());
  f.replace({ ...f.receipt(), revision: f.receipt().revision + 1 });
  release({ kind: 'free', installationId: 'c'.repeat(64) });
  await preparing;
  f.commitRefusal();
  expect(f.owner.adoptRecoveryRefusal(f.receipt(), f.confirmation(), f.proof())).toBe(false);
});
it('rejects changed managed credentials even if a broken referenced read returns the same kind', async () => {
  const f = await fixture('managed');
  await f.prepare();
  f.commitRefusal();
  expect(f.owner.adoptRecoveryRefusal(f.receipt(), f.confirmation(), f.proof())).toBe(true);
  f.owner.requestRefusal(f.receipt().journal.id);
  f.confirm();
  f.rawVault.readReferenced.mockResolvedValueOnce({
    kind: 'managed',
    value: 'changed-synthetic-code',
  });
  await f.owner.send();
  expect(f.state().phase).toBe('error');
  expect(f.transport).not.toHaveBeenCalled();
});
it('rejects an oversized original before decoder or credential work', async () => {
  const f = await fixture();
  await f.prepare(new Uint8Array(MAX_AI_REPORT_BYTES + 1));
  expect(f.admit).not.toHaveBeenCalled();
  expect(f.rawVault.readReferenced).not.toHaveBeenCalled();
  f.commitRefusal();
  expect(f.owner.adoptRecoveryRefusal(f.receipt(), f.confirmation(), f.proof())).toBe(false);
});

it.each(['before gate', 'credential await'])(
  'rejects changed current output at %s',
  async (boundary) => {
    const f = await fixture();
    await f.prepare();
    f.commitPicture();
    f.owner.adoptRecoveryPicture(f.receipt(), OUTPUT, 'image/png', f.proof(), URI);
    let release, sending;
    if (boundary === 'credential await') {
      f.owner.request(URI);
      f.confirm();
      f.rawVault.readReferenced.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          })
      );
      sending = f.owner.send();
      await vi.waitUntil(() => typeof release === 'function', {
        timeout: CREDENTIAL_READ_TIMEOUT_MS,
      });
    }
    const current = f.receipt();
    f.replace({
      ...current,
      resultDigest: '9'.repeat(64),
      recovery: {
        ...current.recovery,
        delivery: { ...current.recovery.delivery, digest: '9'.repeat(64) },
      },
    });
    if (sending) {
      release({ kind: 'free', installationId: 'c'.repeat(64) });
      await sending;
    } else f.owner.request(URI);
    expect(f.state().phase).toBe(boundary === 'credential await' ? 'idle' : 'unavailable');
    expect(f.transport).not.toHaveBeenCalled();
  }
);
it.each(['style', 'predecessor', 'expiry', 'terminal outcome'])(
  'rechecks adopted refusal %s after final credential await',
  async (change) => {
    const f = await fixture();
    await f.prepare();
    f.commitRefusal();
    expect(f.owner.adoptRecoveryRefusal(f.receipt(), f.confirmation(), f.proof())).toBe(true);
    f.owner.requestRefusal(f.receipt().journal.id);
    f.confirm();
    let release;
    f.rawVault.readReferenced.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const sending = f.owner.send();
    await vi.waitUntil(() => typeof release === 'function', {
      timeout: CREDENTIAL_READ_TIMEOUT_MS,
    });
    const current = f.receipt();
    if (change === 'style')
      f.replace({ ...current, journal: { ...current.journal, style: 'Felt' } });
    if (change === 'predecessor')
      f.replace({
        ...current,
        recovery: {
          ...current.recovery,
          sourceHeld: {
            ...current.recovery.sourceHeld,
            revision: current.recovery.sourceHeld.revision + 1,
          },
        },
      });
    if (change === 'expiry')
      f.replace({
        ...current,
        recovery: {
          ...current.recovery,
          expiry: { ...current.recovery.expiry, expiresAt: EXPIRES + 1 },
        },
      });
    if (change === 'terminal outcome')
      f.replace({ ...current, recovery: { ...current.recovery, outcome: 'error' } });
    release({ kind: 'free', installationId: 'c'.repeat(64) });
    await sending;
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.state().phase).toBe('idle');
  }
);
it('rejects decoder mutation of the original bytes before preserving report context', async () => {
  const f = await fixture();
  f.admit.mockImplementationOnce(async (bytes) => {
    bytes.fill(0);
  });
  await f.prepare();
  f.commitRefusal();
  expect(f.owner.adoptRecoveryRefusal(f.receipt(), f.confirmation(), f.proof())).toBe(false);
  expect(f.transport).not.toHaveBeenCalled();
});
