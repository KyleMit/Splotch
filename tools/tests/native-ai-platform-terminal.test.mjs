import { rgbaPng } from './native-png-fixtures.mjs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  files: new Map(),
  storage: vi.fn(),
  decode: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  pin: vi.fn(),
  referenced: vi.fn(),
  remove: vi.fn(),
  id: vi.fn(),
}));
vi.mock('expo/fetch', () => ({ fetch: vi.fn() }));
vi.mock('react-native', () => ({
  NativeModules: {
    SplotchAIEnvironment: {
      installationId: fixture.id,
      aiStorage: fixture.storage,
      decodeImage: fixture.decode,
      readCredential: fixture.read,
      writeCredential: fixture.write,
      writeReferencedCredential: fixture.write,
      pinCredentialReference: fixture.pin,
      readReferencedCredential: fixture.referenced,
      removeCredential: fixture.remove,
    },
  },
}));
vi.mock('expo-file-system', () => {
  function uri(parts) {
    return parts
      .map((part) =>
        typeof part === 'string' ? part.replace(/\/$/, '') : part.uri.replace(/\/$/, '')
      )
      .join('/');
  }
  class File {
    constructor(...parts) {
      this.uri = uri(parts);
    }
    get name() {
      return this.uri.split('/').at(-1);
    }
    get exists() {
      return fixture.files.has(this.uri);
    }
    get size() {
      return fixture.files.get(this.uri)?.length ?? 0;
    }
    create() {
      if (this.exists) throw new Error('Exists');
      fixture.files.set(this.uri, new Uint8Array());
    }
    async write(value) {
      // Expo SDK 58's write() is asynchronous: the bytes land after it returns.
      await Promise.resolve();
      fixture.files.set(
        this.uri,
        typeof value === 'string' ? new TextEncoder().encode(value) : value.slice()
      );
    }
    async text() {
      return new TextDecoder().decode(fixture.files.get(this.uri));
    }
    async bytes() {
      return fixture.files.get(this.uri).slice();
    }
    async move(destination) {
      fixture.files.set(destination.uri, fixture.files.get(this.uri));
      fixture.files.delete(this.uri);
      this.uri = destination.uri;
    }
    delete() {
      fixture.files.delete(this.uri);
    }
  }
  class Directory {
    constructor(...parts) {
      this.uri = uri(parts) + '/';
    }
    get exists() {
      return [...fixture.files.keys()].some((path) => path.startsWith(this.uri));
    }
    create() {}
    list() {
      return [...fixture.files.keys()]
        .filter((path) => path.startsWith(this.uri))
        .map((path) => new File(path));
    }
  }
  return { Directory, File, Paths: { document: 'file:///owned/' } };
});
let aiStorage;
const journal = {
  version: 1,
  id: 1,
  createdAt: 1,
  style: 'Magical',
  originalId: 'picture-1-fixture',
  phase: 'sent',
  jobId: null,
  result: null,
};
afterEach(() => vi.useRealTimers());
beforeEach(async () => {
  fixture.files.clear();
  vi.resetAllMocks();
  vi.resetModules();
  fixture.decode.mockImplementation(async (_, __, width, height) => ({ width, height }));
  fixture.id.mockResolvedValue('a'.repeat(64));
  fixture.read.mockResolvedValue(null);
  fixture.pin.mockResolvedValue('b'.repeat(64));
  fixture.referenced.mockResolvedValue('fixture-key');
  fixture.storage.mockImplementation(async (kind) =>
    JSON.stringify(kind === 'pictures' ? { pictures: [] } : { receipt: null })
  );
  ({ aiStorage } = await import('../../experiments/native-architecture/src/platform/ai.ts'));
  await aiStorage.read();
  fixture.storage.mockClear();
});
function committed(journal, revision = 1) {
  return {
    kind: 'prepared',
    journal,
    revision,
    originalRevision: 1,
    inputLength: rgbaPng(2, 2, 255).length,
    resultDigest: journal.result ? 'f'.repeat(64) : null,
    resultLength: journal.result ? rgbaPng(2, 2, 255).length : null,
    nonce: 'c'.repeat(64),
    originalDigest: 'd'.repeat(64),
    inputDigest: 'e'.repeat(64),
  };
}
async function nativeRecoveryFixture() {
  const { createHash } = await import('node:crypto');
  const bytes = new Uint8Array(rgbaPng(2, 2, 255));
  const inputDigest = createHash('sha256').update(bytes).digest('hex');
  const source = {
    ...committed({ ...journal, phase: 'unknown' }),
    inputDigest,
    kind: 'recovery-held',
    recovery: {
      version: 2,
      protocol: 'splotch-ai-recovery-v1',
      id: 'a'.repeat(64),
      credential: { kind: 'free', reference: 'b'.repeat(64) },
      expiry: { kind: 'unknown' },
      intent: 'committed',
    },
  };
  let current = source;
  fixture.storage.mockImplementation(async (kind, raw) => {
    const payload = JSON.parse(raw);
    if (kind === 'prepareRecoverySendFromHeld') {
      const nonce = 'f'.repeat(64);
      current = {
        ...source,
        kind: 'recovery-request',
        nonce,
        journal: { ...source.journal, id: payload.id, createdAt: payload.createdAt },
        recovery: {
          version: 3,
          protocol: 'splotch-ai-recovery-v1',
          id: createHash('sha256')
            .update(JSON.stringify(['splotch-ai-recovery-v1', nonce, payload.createdAt]))
            .digest('hex'),
          sourceHeld: payload.source,
          credential: payload.credential,
          state: 'prepared',
          expiry: { kind: 'unknown' },
        },
      };
    }
    if (kind === 'markRecoverySubmission')
      current = {
        ...current,
        revision: current.revision + 1,
        recovery: { ...current.recovery, state: 'submission-uncertain' },
      };
    if (kind === 'readRecoveryUpload')
      return JSON.stringify({ receipt: current, upload: Buffer.from(bytes).toString('base64') });
    if (kind === 'retainRecoveryResult') {
      const uri = 'file:///owned/recovery/attempt-2/result.bin';
      fixture.files.set(uri, new Uint8Array(Buffer.from(payload.bytes, 'base64')));
      current = {
        ...current,
        revision: current.revision + 2,
        resultDigest: payload.delivery.digest,
        resultLength: payload.delivery.length,
        journal: {
          ...current.journal,
          phase: 'result',
          result: { uri, mime: payload.delivery.mime },
        },
        recovery: {
          ...current.recovery,
          state: 'retained',
          delivery: payload.delivery,
          expiry: {
            kind: 'known',
            expiresAt: payload.delivery.expiresAt,
            provenance: 'validated-recovery-response',
          },
        },
      };
    }
    if (kind === 'recordRecoveryTerminal')
      current = {
        ...current,
        revision: current.revision + 1,
        journal: { ...current.journal, phase: 'failed' },
        recovery: {
          ...current.recovery,
          state: 'terminal',
          outcome: payload.confirmation.body.outcome,
          expiry: {
            kind: 'known',
            expiresAt: payload.confirmation.body.expiresAt,
            provenance: 'validated-recovery-response',
          },
        },
      };
    if (kind === 'recordAck')
      current = {
        ...current,
        revision: current.revision + 1,
        recovery: { ...current.recovery, state: 'acknowledged' },
      };
    return JSON.stringify({
      receipt: kind === 'readRecoveryAttempt' && payload.id === 1 ? source : current,
    });
  });
  const held = (await aiStorage.read()).receipt;
  const prepared = await aiStorage.prepareRecoverySendFromHeld(
    held,
    2,
    2000,
    source.recovery.credential
  );
  const marked = await aiStorage.markRecoverySubmission(prepared);
  return { bytes, source, marked, inputDigest };
}

function nativeTerminal(receipt) {
  return {
    status: 410,
    body: {
      ok: false,
      error: 'Fixture confirmed expiry',
      code: 'RECOVERY_TERMINAL',
      protocol: 'splotch-ai-recovery-v1',
      id: receipt.recovery.id,
      createdAt: receipt.journal.createdAt,
      expiresAt: receipt.journal.createdAt + 1200000,
      outcome: 'expired',
    },
  };
}
it('passes only a checked receipt selector and exact terminal tuple to the native journal owner', async () => {
  const { marked } = await nativeRecoveryFixture();
  const confirmation = nativeTerminal(marked);
  const terminal = await aiStorage.recordRecoveryTerminal(marked, confirmation);
  expect(terminal.recovery.state).toBe('terminal');
  expect(
    JSON.parse(fixture.storage.mock.calls.find(([kind]) => kind === 'recordRecoveryTerminal')[1])
  ).toEqual({
    id: marked.journal.id,
    nonce: marked.nonce,
    revision: marked.revision,
    confirmation,
  });
  expect(terminal.recovery.outcome).toBe('expired');
  expect((await aiStorage.readRecoveryAttempt(1)).kind).toBe('recovery-held');
});
it('requires authoritative native reread after a terminal bridge callback is lost', async () => {
  const { marked } = await nativeRecoveryFixture();
  const original = fixture.storage.getMockImplementation();
  fixture.storage.mockImplementationOnce(async (...args) => {
    await original(...args);
    throw new Error('lost terminal callback');
  });
  await expect(aiStorage.recordRecoveryTerminal(marked, nativeTerminal(marked))).rejects.toThrow();
  await expect(aiStorage.markRecoverySubmission(marked)).rejects.toThrow('unconfirmed');
  const terminal = await aiStorage.readRecoveryAttempt(2);
  expect(terminal.recovery.state).toBe('terminal');
  expect((await aiStorage.readRecoveryAttempt(1)).kind).toBe('recovery-held');
});
it('rejects forged terminal tuple and nonterminal readback before admitting it', async () => {
  const { marked } = await nativeRecoveryFixture();
  const changed = nativeTerminal(marked);
  changed.body.createdAt += 1;
  await expect(aiStorage.recordRecoveryTerminal(marked, changed)).rejects.toThrow();
  expect(
    fixture.storage.mock.calls.filter(([kind]) => kind === 'recordRecoveryTerminal')
  ).toHaveLength(0);
  const current = await aiStorage.readRecoveryAttempt(2);
  fixture.storage.mockResolvedValueOnce(JSON.stringify({ receipt: current }));
  await expect(
    aiStorage.recordRecoveryTerminal(current, nativeTerminal(current))
  ).rejects.toThrow();
  expect(current.recovery.state).toBe('submission-uncertain');
});

it.each(['delivery-pinned', 'retained', 'acknowledged'])(
  'never passes an expired proof for %s into native mutation',
  async (state) => {
    const { marked, bytes, inputDigest } = await nativeRecoveryFixture();
    const delivery = {
      expiresAt: 1202000,
      digest: inputDigest,
      receipt: 'e'.repeat(64),
      mime: 'image/png',
      length: bytes.length,
    };
    let receipt;
    if (state === 'delivery-pinned') {
      const pinned = {
        ...marked,
        revision: marked.revision + 1,
        recovery: {
          ...marked.recovery,
          state,
          delivery,
          expiry: {
            kind: 'known',
            expiresAt: delivery.expiresAt,
            provenance: 'validated-recovery-response',
          },
        },
      };
      fixture.storage.mockResolvedValueOnce(JSON.stringify({ receipt: pinned }));
      receipt = await aiStorage.readRecoveryAttempt(2);
    } else {
      const retained = await aiStorage.retainRecoveryResult(marked, delivery, bytes);
      receipt = retained.receipt;
      if (state === 'acknowledged')
        receipt = await aiStorage.recordAck(receipt, {
          status: 200,
          body: {
            ok: true,
            protocol: 'splotch-ai-recovery-v1',
            id: receipt.recovery.id,
            phase: 'acknowledged',
            expiresAt: delivery.expiresAt,
            deliveryDigest: delivery.digest,
            deliveryReceipt: delivery.receipt,
          },
        });
    }
    await expect(
      aiStorage.recordRecoveryTerminal(receipt, nativeTerminal(receipt))
    ).rejects.toThrow();
    expect(
      fixture.storage.mock.calls.filter(([kind]) => kind === 'recordRecoveryTerminal')
    ).toHaveLength(0);
    expect(receipt.recovery.state).toBe(state);
  }
);
