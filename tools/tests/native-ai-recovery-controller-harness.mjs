import { expect, vi } from 'vitest';
import { AiRecoverySession } from '../../experiments/native-architecture/src/ai/recoverySession.ts';
import { withCredentialLeases } from '../../experiments/native-architecture/src/ai/credentialLease.ts';
import { recoveryDigest } from '../../experiments/native-architecture/src/ai/recoveryDigest.ts';
import {
  recoveryRequestId,
  checkedRecoveryAdmission,
  checkedRecoveryDelivery,
  checkedRecoveryAck,
} from '../../experiments/native-architecture/src/ai/recoveryRequest.ts';
import { parseAiResponse } from '../../experiments/native-architecture/src/ai/transport.ts';
import {
  RECOVERY_PROTOCOL,
  RECOVERY_EXPIRES_HEADER,
  RECOVERY_DIGEST_HEADER,
  RECOVERY_RECEIPT_HEADER,
  RECOVERY_VERSION_HEADER,
} from '../../experiments/native-architecture/src/ai/recoveryContract.ts';
import { rgbaPng } from './native-png-fixtures.mjs';

export const CREATED = 1700000000000;
export const INPUT = new Uint8Array(rgbaPng(2, 2, 255));
export const OUTPUT = new Uint8Array(rgbaPng(3, 3, 255));
const REFERENCE = Object.freeze({ kind: 'free', reference: 'b'.repeat(64) });
export const DELIVERY_RECEIPT = 'e'.repeat(64);
const cleanups = [];
export function cleanupRecoveryFixtures() {
  for (const dispose of cleanups.splice(0)) dispose();
  vi.restoreAllMocks();
}
class RecoveryFixtureOwner extends AiRecoverySession {
  constructor(deps, request) {
    super(deps);
    if (request) this.dispatchRecovery = request;
  }
  show(receipt) {
    this.credential = { kind: 'free', installationId: 'a'.repeat(64) };
    this.update({ open: true, authorized: true, credential: 'free', recovery: receipt });
  }
}
function held() {
  return Object.freeze({
    kind: 'recovery-held',
    nonce: 'c'.repeat(64),
    revision: 2,
    originalRevision: 1,
    originalDigest: 'd'.repeat(64),
    inputDigest: recoveryDigest(INPUT),
    inputLength: INPUT.length,
    resultDigest: null,
    resultLength: null,
    journal: Object.freeze({
      version: 1,
      id: 1,
      createdAt: CREATED,
      style: 'Magical',
      originalId: 'picture-1-fixture',
      phase: 'unknown',
      jobId: null,
      result: null,
    }),
    recovery: Object.freeze({
      version: 2,
      protocol: RECOVERY_PROTOCOL,
      id: 'f'.repeat(64),
      credential: REFERENCE,
      intent: 'committed',
      expiry: { kind: 'unknown' },
    }),
  });
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
export function fixture({ guarded = false, source = held() } = {}) {
  vi.spyOn(Date, 'now').mockReturnValue(CREATED + 100);
  let epoch = 0;
  let enabled = true;
  let latest = source;
  const records = new Map(source ? [[source.journal.id, source]] : []);
  const save = (receipt) => {
    latest = Object.freeze(receipt);
    records.set(latest.journal.id, latest);
    return latest;
  };
  /** @type {import('../../experiments/native-architecture/src/parentCenter/parentPolicy.ts').ParentOperationPort} */
  const parent = {
    consent: () => ({ enabled, epoch }),
    request: vi.fn((feature, action) => {
      const owned = epoch;
      action({ valid: () => enabled && epoch === owned });
      return true;
    }),
    cancel: vi.fn(),
  };
  const rawVault = {
    read: vi.fn(async () => null),
    write: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    installationId: vi.fn(async () => 'a'.repeat(64)),
    pin: vi.fn(async () => REFERENCE),
    readReferenced: vi.fn(async () => ({ kind: 'free', installationId: 'a'.repeat(64) })),
  };
  const vault = withCredentialLeases(rawVault);
  /** @type {import('../../experiments/native-architecture/src/ai/journal.ts').AiStorage} */
  const storage = {
    read: vi.fn(async () => (latest ? { kind: latest.kind, receipt: latest } : null)),
    readRecoveryAttempt: vi.fn(async (id) => records.get(id) ?? null),
    prepareRecoverySendFromHeld: vi.fn(async (before, id, createdAt, credential) => {
      if (records.get(before.journal.id) !== before) throw new Error('Stale source');
      const nonce = '9'.repeat(64);
      return save({
        ...before,
        kind: 'recovery-request',
        nonce,
        revision: 1,
        journal: Object.freeze({ ...before.journal, id, createdAt }),
        recovery: Object.freeze({
          version: 3,
          protocol: RECOVERY_PROTOCOL,
          id: await recoveryRequestId(nonce, createdAt),
          credential,
          sourceHeld: { id: before.journal.id, nonce: before.nonce, revision: before.revision },
          state: 'prepared',
          expiry: { kind: 'unknown' },
        }),
      });
    }),
    markRecoverySubmission: vi.fn(async (before) =>
      save({
        ...before,
        revision: before.revision + 1,
        recovery: { ...before.recovery, state: 'submission-uncertain' },
      })
    ),
    readRecoveryUpload: vi.fn(async () => new Uint8Array(INPUT)),
    recordRecoveryAdmission: vi.fn(async (before, status) => {
      const checked = checkedRecoveryAdmission(before, status);
      const terminal = checked.phase === 'refusal' || checked.phase === 'error';
      return save({
        ...before,
        revision: before.revision + 1,
        journal: { ...before.journal, phase: terminal ? 'failed' : 'unknown' },
        recovery: {
          ...before.recovery,
          state: terminal ? 'terminal' : 'admitted',
          ...(terminal ? { outcome: checked.phase } : {}),
          expiry: {
            kind: 'known',
            expiresAt: checked.expiresAt,
            provenance: 'validated-recovery-response',
          },
        },
      });
    }),
    retainRecoveryResult: vi.fn(async (before, raw, bytes) => {
      const delivery = checkedRecoveryDelivery(before, raw);
      if (recoveryDigest(bytes) !== delivery.digest) throw new Error('Changed bytes');
      const picture = {
        uri: `data:${delivery.mime};base64,${Buffer.from(bytes).toString('base64')}`,
        mime: delivery.mime,
      };
      const receipt = save({
        ...before,
        revision: before.revision + 2,
        journal: { ...before.journal, phase: 'result', result: picture },
        resultDigest: delivery.digest,
        resultLength: delivery.length,
        recovery: {
          ...before.recovery,
          state: 'retained',
          delivery,
          expiry: {
            kind: 'known',
            expiresAt: delivery.expiresAt,
            provenance: 'validated-recovery-response',
          },
        },
      });
      return { receipt, picture };
    }),
    recordAck: vi.fn(async (before, confirmation) => {
      checkedRecoveryAck(before, confirmation);
      return save({
        ...before,
        revision: before.revision + 1,
        recovery: { ...before.recovery, state: 'acknowledged' },
      });
    }),
    prepareRecovery: vi.fn(async (journal, _, bytes, credential) =>
      save({
        ...held(),
        journal,
        inputDigest: recoveryDigest(bytes),
        inputLength: bytes.length,
        recovery: { ...held().recovery, credential, intent: 'prepared' },
      })
    ),
    commitRecoveryIntent: vi.fn(async (before) =>
      save({
        ...before,
        revision: before.revision + 1,
        recovery: { ...before.recovery, intent: 'committed' },
      })
    ),
    recordRecoveryStatus: vi.fn(),
    prepare: vi.fn(),
    readPreparedUpload: vi.fn(),
    write: vi.fn(),
    retain: vi.fn(),
    pictures: vi.fn(async () => []),
  };
  const transport = vi.fn();
  /** @type {typeof import('../../experiments/native-architecture/src/ai/transport.ts').requestAi} */
  const dispatch = vi.fn(async (_, request) => {
    const current = latest;
    const expiresAt = current.journal.createdAt + 1200000;
    const isAck = request.recovery.kind === 'ack';
    const headers = {
      'Content-Type': isAck
        ? 'application/json'
        : request.method === 'GET'
          ? 'image/png'
          : 'application/json',
      [RECOVERY_VERSION_HEADER]: RECOVERY_PROTOCOL,
      [RECOVERY_EXPIRES_HEADER]: String(expiresAt),
    };
    let body;
    if (isAck)
      body = JSON.stringify({
        ok: true,
        protocol: RECOVERY_PROTOCOL,
        id: current.recovery.id,
        phase: 'acknowledged',
        expiresAt,
        deliveryDigest: current.recovery.delivery.digest,
        deliveryReceipt: current.recovery.delivery.receipt,
      });
    else if (request.method === 'GET') {
      headers[RECOVERY_DIGEST_HEADER] = recoveryDigest(OUTPUT);
      headers[RECOVERY_RECEIPT_HEADER] = DELIVERY_RECEIPT;
      body = OUTPUT;
    } else
      body = JSON.stringify({
        ok: true,
        protocol: RECOVERY_PROTOCOL,
        id: current.recovery.id,
        expiresAt,
        phase: 'pending',
        pollAfterMs: 4000,
      });
    return parseAiResponse(
      new Response(body, { status: isAck || request.method === 'GET' ? 200 : 202, headers }),
      request,
      new AbortController().signal,
      CREATED + 100
    );
  });
  const prepare = vi.fn(async () => ({
    bytes: new Uint8Array(INPUT),
    originalId: 'picture-1-fixture',
    originalModel: '{}',
  }));
  const admit = vi.fn(async () => {});
  const owner = new RecoveryFixtureOwner(
    { parent, vault, storage, transport, prepare, admit },
    guarded ? null : dispatch
  );
  owner.show(source);
  cleanups.push(owner.dispose);
  const idle = async () => vi.waitFor(() => expect(owner.getState().busy).toBe(false));
  const start = async (method) => {
    await owner[method]();
    await idle();
  };
  return {
    owner,
    parent,
    vault,
    rawVault,
    storage,
    transport,
    dispatch,
    prepare,
    admit,
    records,
    latest: () => latest,
    save,
    idle,
    start,
    revoke: (kind) => {
      if (kind === 'close') owner.close();
      else if (kind === 'dispose') owner.dispose();
      else if (kind === 'vault-write') void vault.write('byok', 'synthetic-fixture');
      else if (kind === 'vault-remove') void vault.remove('managed');
      else {
        epoch += 1;
        if (kind === 'consent') enabled = false;
      }
    },
  };
}
export function block(method) {
  const started = deferred(),
    release = deferred();
  const original = method.getMockImplementation();
  method.mockImplementationOnce(async (...args) => {
    const value = await original(...args);
    started.resolve();
    await release.promise;
    return value;
  });
  return { started: started.promise, release: release.resolve };
}
