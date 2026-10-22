import { JOB_TTL_MS } from '../../src/ai/contract.ts';
import { vi } from 'vitest';
import { createAiReportOwner } from '../../src/ai/reportOwner.ts';
import { withCredentialLeases } from '../../src/ai/credentialLease.ts';
import { recoveryRequestId } from '../../src/ai/recoveryRequest.ts';
import { recoveryDigest } from '../../src/ai/recoveryDigest.ts';
import { rgbaPng } from './native-png-fixtures.mjs';
export const CREATED = 1700000000000;
export const EXPIRES = CREATED + JOB_TTL_MS;
export const INPUT = new Uint8Array(rgbaPng(2, 2, 255));
export const OUTPUT = new Uint8Array(rgbaPng(3, 3, 255));
export const TOKEN = 'opaque.pinned-recovery';
export const URI = 'file:///owned/recovery-result.png';
const REPORT_ID = '1723123456789-550e8400-e29b-41d4-a716-446655440000';
const owners = [];
export function disposeRecoveryReportOwners() {
  for (const owner of owners.splice(0)) owner.dispose();
}
export async function fixture(kind = 'free') {
  let allowed = true,
    receipt,
    state,
    gate;
  const nonce = 'a'.repeat(64);
  const reference = { kind, reference: 'b'.repeat(64) };
  const credential =
    kind === 'free'
      ? { kind, installationId: 'c'.repeat(64) }
      : { kind, value: 'synthetic-original' };
  receipt = {
    kind: 'recovery-request',
    nonce,
    revision: 2,
    originalRevision: 1,
    originalDigest: 'd'.repeat(64),
    inputDigest: recoveryDigest(INPUT),
    inputLength: INPUT.length,
    resultDigest: null,
    resultLength: null,
    journal: {
      version: 1,
      id: 2,
      createdAt: CREATED,
      style: 'Clay',
      originalId: 'picture-1-fixture',
      phase: 'unknown',
      jobId: null,
      result: null,
    },
    recovery: {
      version: 3,
      protocol: 'splotch-ai-recovery-v1',
      id: await recoveryRequestId(nonce, CREATED),
      credential: reference,
      sourceHeld: { id: 1, nonce: 'e'.repeat(64), revision: 2 },
      state: 'submission-uncertain',
      expiry: { kind: 'unknown' },
    },
  };
  const rawVault = {
    read: vi.fn(),
    installationId: vi.fn(),
    write: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    pin: vi.fn(async () => reference),
    readReferenced: vi.fn(async () => credential),
  };
  const vault = withCredentialLeases(rawVault);
  const admit = vi.fn(async () => {});
  const transport = vi.fn(
    async () => new Response(JSON.stringify({ ok: true, reportId: REPORT_ID }))
  );
  const parent = {
    consent: () => ({ enabled: allowed, epoch: 1 }),
    cancel: vi.fn(),
    request: vi.fn((_, callback) => {
      gate = callback;
      return true;
    }),
  };
  const owner = createAiReportOwner({
    vault,
    admit,
    transport,
    parent,
    current: () => allowed,
    publish: (next) => {
      state = next;
    },
  });
  owners.push(owner);
  const permission = { lease: vault.lease(), permitted: () => allowed, current: () => receipt };
  const prepare = (bytes = INPUT) => owner.prepareRecovery(receipt, bytes, permission);
  const commitRefusal = (mutate = (value) => value) => {
    receipt = mutate({
      ...receipt,
      revision: receipt.revision + 1,
      journal: { ...receipt.journal, phase: 'failed' },
      recovery: {
        ...receipt.recovery,
        state: 'terminal',
        outcome: 'refusal',
        expiry: { kind: 'known', expiresAt: EXPIRES, provenance: 'validated-recovery-response' },
      },
    });
    return receipt;
  };
  const confirmation = () => ({
    status: 422,
    body: {
      ok: false,
      error: 'Authenticated reason',
      code: 'RECOVERY_TERMINAL',
      protocol: 'splotch-ai-recovery-v1',
      id: receipt.recovery.id,
      createdAt: receipt.journal.createdAt,
      expiresAt: receipt.recovery.expiry.expiresAt,
      outcome: 'refusal',
    },
  });
  const proof = (token = TOKEN) => ({
    id: receipt.recovery.id,
    createdAt: receipt.journal.createdAt,
    expiresAt: EXPIRES,
    token,
  });
  const commitPicture = () => {
    const digest = recoveryDigest(OUTPUT);
    receipt = {
      ...receipt,
      revision: receipt.revision + 2,
      resultDigest: digest,
      resultLength: OUTPUT.length,
      journal: { ...receipt.journal, phase: 'result', result: { uri: URI, mime: 'image/png' } },
      recovery: {
        ...receipt.recovery,
        state: 'retained',
        expiry: { kind: 'known', expiresAt: EXPIRES, provenance: 'validated-recovery-response' },
        delivery: {
          expiresAt: EXPIRES,
          digest,
          length: OUTPUT.length,
          mime: 'image/png',
          receipt: 'f'.repeat(64),
        },
      },
    };
    return receipt;
  };
  return {
    owner,
    vault,
    rawVault,
    admit,
    transport,
    parent,
    prepare,
    commitRefusal,
    commitPicture,
    confirmation,
    proof,
    receipt: () => receipt,
    state: () => state,
    replace: (next) => {
      receipt = next;
    },
    confirm: () => gate({ valid: () => allowed }),
    revoke: () => {
      allowed = false;
    },
  };
}
