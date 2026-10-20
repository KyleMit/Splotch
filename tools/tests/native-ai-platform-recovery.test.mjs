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
const originalModel = JSON.stringify({ version: 5, pageId: 'blank', rainbow: 0, strokes: [] });
it('exposes every recovery operation through the production native storage facade', () => {
  for (const operation of [
    'prepareRecoverySendFromHeld',
    'markRecoverySubmission',
    'readRecoveryUpload',
    'recordRecoveryAdmission',
    'recordRecoveryTerminal',
    'retainRecoveryResult',
    'recordAck',
    'readRecoveryAttempt',
  ])
    expect(typeof aiStorage[operation]).toBe('function');
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
it('admits a separately tagged held recovery restart, rejects malformed and regressing metadata, and never writes it as legacy', async () => {
  const recoveryStorage = aiStorage;
  const heldJournal = { ...journal, phase: 'unknown' };
  const held = {
    ...committed(heldJournal),
    kind: 'recovery-held',
    recovery: {
      version: 2,
      protocol: 'splotch-ai-recovery-v1',
      id: 'a'.repeat(64),
      credential: { kind: 'byok', reference: 'b'.repeat(64) },
      expiry: { kind: 'unknown' },
      intent: 'prepared',
    },
  };
  const reply = (value) => fixture.storage.mockResolvedValue(JSON.stringify({ receipt: value }));
  for (const changed of [
    { ...held, recovery: { ...held.recovery, version: 1 } },
    {
      ...held,
      recovery: { ...held.recovery, credential: { kind: 'byok', reference: 'plaintext-key' } },
    },
    {
      ...held,
      recovery: { ...held.recovery, credential: { ...held.recovery.credential, value: 'secret' } },
    },
    {
      ...held,
      recovery: {
        ...held.recovery,
        expiry: { kind: 'known', expiresAt: 1170001, provenance: 'admitted-status-202' },
      },
    },
    { ...held, journal: { ...heldJournal, phase: 'sent' } },
    { ...held, recovery: { ...held.recovery, intent: 'unsent' } },
  ]) {
    reply(changed);
    await expect(aiStorage.read()).rejects.toThrow();
  }
  reply(held);
  const first = await recoveryStorage.read();
  expect(first.kind).toBe('recovery-held');
  expect(first.receipt.recovery).toEqual(held.recovery);
  expect(Object.isFrozen(first.receipt.recovery.credential)).toBe(true);
  const known = {
    ...held,
    revision: 2,
    recovery: {
      ...held.recovery,
      intent: 'committed',
      expiry: { kind: 'known', expiresAt: 1170001, provenance: 'admitted-status-202' },
    },
  };
  reply(known);
  const second = await recoveryStorage.read();
  expect(second.receipt.recovery.expiry).toEqual({
    kind: 'known',
    expiresAt: 1170001,
    provenance: 'admitted-status-202',
  });
  for (const changed of [
    { ...known, revision: 3, recovery: { ...known.recovery, intent: 'prepared' } },
    { ...known, revision: 3, recovery: { ...known.recovery, expiry: { kind: 'unknown' } } },
    {
      ...known,
      revision: 3,
      recovery: { ...known.recovery, expiry: { kind: 'known', expiresAt: 1260001 } },
    },
    {
      ...known,
      revision: 3,
      recovery: { ...known.recovery, credential: { kind: 'byok', reference: 'f'.repeat(64) } },
    },
    { ...known, revision: 3, inputDigest: 'f'.repeat(64) },
    null,
    committed(heldJournal),
  ]) {
    reply(changed);
    await expect(aiStorage.read()).rejects.toThrow();
  }
  expect(fixture.storage.mock.calls.every(([kind]) => kind === 'read')).toBe(true);
  expect(fixture.files.size).toBe(0);
});

it('creates exact pinned recovery bytes, commits intent once and records only admitted original 202 expiry', async () => {
  const storage = aiStorage;
  const { parseRecoveryJson, RECOVERY_EXPIRES_HEADER } =
    await import('../../experiments/native-architecture/src/ai/recoveryContract.ts');
  const original = '  ' + originalModel + '\n';
  const bytes = new Uint8Array(rgbaPng(2, 2, 255));
  const reference = { kind: 'byok', reference: 'b'.repeat(64) };
  const nextJournal = { ...journal, phase: 'unknown' };
  let current;
  const commands = [];
  fixture.storage.mockImplementation(async (kind, raw) => {
    const value = JSON.parse(raw);
    commands.push({ kind, value });
    if (kind === 'prepareRecovery')
      current = {
        ...committed(nextJournal),
        kind: 'recovery-held',
        recovery: {
          version: 2,
          protocol: 'splotch-ai-recovery-v1',
          id: 'a'.repeat(64),
          credential: reference,
          expiry: { kind: 'unknown' },
          intent: 'prepared',
        },
      };
    if (kind === 'commitRecoveryIntent')
      current = { ...current, revision: 2, recovery: { ...current.recovery, intent: 'committed' } };
    if (kind === 'recordRecoveryStatus')
      current = {
        ...current,
        revision: 3,
        recovery: {
          ...current.recovery,
          expiry: {
            kind: 'known',
            expiresAt: value.status.expiresAt,
            provenance: 'admitted-status-202',
          },
        },
      };
    return JSON.stringify({ receipt: current });
  });
  const prepared = await storage.prepareRecovery(nextJournal, original, bytes, reference);
  expect(commands[0].value).toEqual({
    journal: nextJournal,
    originalModel: original,
    upload: Buffer.from(bytes).toString('base64'),
    credential: reference,
  });
  expect(prepared.recovery.expiry).toEqual({ kind: 'unknown' });
  const intent = await storage.commitRecoveryIntent(prepared);
  expect(intent.recovery.intent).toBe('committed');
  const headers = new Headers({ [RECOVERY_EXPIRES_HEADER]: '1170001' });
  const body = {
    ok: true,
    protocol: 'splotch-ai-recovery-v1',
    id: intent.recovery.id,
    expiresAt: 1170001,
    phase: 'pending',
    pollAfterMs: 4000,
  };
  const read = {
    kind: 'collect',
    id: intent.recovery.id,
    createdAt: nextJournal.createdAt,
    expiry: { kind: 'unknown' },
  };
  expect(() => parseRecoveryJson(202, { ...body, expiresAt: 1170002 }, headers, read)).toThrow();
  expect(commands.map(({ kind }) => kind)).toEqual(['prepareRecovery', 'commitRecoveryIntent']);
  const admitted = parseRecoveryJson(202, body, headers, read);
  expect(admitted.kind).toBe('status');
  const known = await storage.recordRecoveryStatus(intent, admitted);
  expect(known.recovery.expiry).toEqual({
    kind: 'known',
    expiresAt: 1170001,
    provenance: 'admitted-status-202',
  });
  expect(commands[2].value.status.headerExpiresAt).toBe('1170001');
  expect(commands[2].value.nonce).toBe(intent.nonce);
  expect(commands[2].value.revision).toBe(intent.revision);
  await expect(storage.commitRecoveryIntent(prepared)).rejects.toThrow('stale');
  expect(commands).toHaveLength(3);
});

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

it('uses finite owned recovery bridge selectors and verifies exact native upload bytes', async () => {
  const { bytes, source, marked } = await nativeRecoveryFixture();
  expect(await aiStorage.readRecoveryUpload(marked)).toEqual(bytes);
  expect(
    JSON.parse(
      fixture.storage.mock.calls.find(([kind]) => kind === 'prepareRecoverySendFromHeld')[1]
    )
  ).toEqual({
    source: { id: 1, nonce: source.nonce, revision: source.revision },
    id: 2,
    createdAt: 2000,
    credential: source.recovery.credential,
  });
  expect(JSON.parse(fixture.storage.mock.calls.at(-1)[1])).toEqual({
    id: 2,
    nonce: marked.nonce,
    revision: marked.revision,
  });
  await expect(aiStorage.readRecoveryUpload({ ...marked })).rejects.toThrow('stale');
});

it('blocks recovery mutation after a bad native upload until an authoritative selected reread', async () => {
  const { marked } = await nativeRecoveryFixture();
  fixture.storage.mockResolvedValueOnce(
    JSON.stringify({ receipt: marked, upload: Buffer.from(rgbaPng(2, 2, 0)).toString('base64') })
  );
  await expect(aiStorage.readRecoveryUpload(marked)).rejects.toThrow();
  await expect(aiStorage.markRecoverySubmission(marked)).rejects.toThrow('unconfirmed');
  const current = await aiStorage.readRecoveryAttempt(2);
  expect(await aiStorage.readRecoveryUpload(current)).toEqual(new Uint8Array(rgbaPng(2, 2, 255)));
});

it('retains verified native delivery bytes and accepts only exact ACK200 proof after local reread', async () => {
  const { marked, bytes, inputDigest } = await nativeRecoveryFixture();
  const delivery = {
    expiresAt: 1202000,
    digest: inputDigest,
    receipt: 'e'.repeat(64),
    mime: 'image/png',
    length: bytes.length,
  };
  const retained = await aiStorage.retainRecoveryResult(marked, delivery, bytes);
  const confirmation = {
    status: 200,
    body: {
      ok: true,
      protocol: 'splotch-ai-recovery-v1',
      id: marked.recovery.id,
      phase: 'acknowledged',
      expiresAt: delivery.expiresAt,
      deliveryDigest: delivery.digest,
      deliveryReceipt: delivery.receipt,
    },
  };
  await expect(
    aiStorage.recordAck(retained.receipt, { ...confirmation, status: 202 })
  ).rejects.toThrow();
  const current = await aiStorage.readRecoveryAttempt(2);
  const acknowledged = await aiStorage.recordAck(current, confirmation);
  expect(acknowledged.recovery.state).toBe('acknowledged');
  expect(acknowledged.journal.result).toEqual(retained.picture);
  expect(fixture.decode.mock.calls.length).toBeGreaterThanOrEqual(4);
  expect(fixture.storage.mock.calls.filter(([kind]) => kind === 'recordAck')).toHaveLength(1);
});
