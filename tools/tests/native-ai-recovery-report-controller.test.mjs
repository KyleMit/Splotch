import { RECOVERY_POLL_AFTER_MS } from '../../src/lib/ai/generationAttempt.ts';
import { JOB_TTL_MS } from '../../src/ai/contract.ts';
import { afterEach, expect, it, vi } from 'vitest';
import { parseAiResponse } from '../../src/ai/transport.ts';
import { recoveryDigest } from '../../src/ai/recoveryDigest.ts';
import {
  RECOVERY_PROTOCOL,
  RECOVERY_VERSION_HEADER,
  RECOVERY_EXPIRES_HEADER,
  RECOVERY_DIGEST_HEADER,
  RECOVERY_RECEIPT_HEADER,
} from '../../src/ai/recoveryContract.ts';
import {
  fixture,
  block,
  cleanupRecoveryFixtures,
  INPUT,
  OUTPUT,
  CREATED,
  DELIVERY_RECEIPT,
} from './native-ai-recovery-controller-harness.mjs';
const TOKEN = 'opaque.current-recovery-proof';
const REPORT_ID = '1723123456789-550e8400-e29b-41d4-a716-446655440000';
const SETTLE_TIMEOUT_MS = 1000;
afterEach(cleanupRecoveryFixtures);
function reportingFixture(options) {
  const f = fixture(options);
  const original = f.parent.request.getMockImplementation();
  let gate;
  f.parent.request.mockImplementation((feature, callback) => {
    if (feature === 'imageReport') {
      gate = callback;
      return true;
    }
    return original(feature, callback);
  });
  f.transport.mockResolvedValue(new Response(JSON.stringify({ ok: true, reportId: REPORT_ID })));
  return { ...f, confirm: () => gate({ valid: () => true }) };
}
function refusalReply(f, request, { token = TOKEN, generic = false, advisory = false } = {}) {
  const receipt = f.latest();
  const expiresAt = receipt.journal.createdAt + JOB_TTL_MS;
  const body = generic
    ? { ok: false, error: 'Unauthenticated client refusal' }
    : advisory
      ? {
          ok: true,
          protocol: RECOVERY_PROTOCOL,
          id: receipt.recovery.id,
          expiresAt,
          phase: 'refusal',
          pollAfterMs: RECOVERY_POLL_AFTER_MS,
        }
      : {
          ok: false,
          error: 'Authenticated provider refusal',
          code: 'RECOVERY_TERMINAL',
          protocol: RECOVERY_PROTOCOL,
          id: receipt.recovery.id,
          createdAt: receipt.journal.createdAt,
          expiresAt,
          outcome: 'refusal',
        };
  return parseAiResponse(
    new Response(JSON.stringify(body), {
      status: advisory ? 202 : 422,
      headers: {
        'Content-Type': 'application/json',
        [RECOVERY_VERSION_HEADER]: RECOVERY_PROTOCOL,
        [RECOVERY_EXPIRES_HEADER]: String(expiresAt),
        ...(token === null ? {} : { 'X-Report-Token': token }),
      },
    }),
    request,
    new AbortController().signal,
    CREATED + 100
  );
}
async function refuse(f, options) {
  f.dispatch.mockImplementationOnce((_, request) => refusalReply(f, request, options));
  await f.start('sendRecovery');
}
async function picture(f, token = TOKEN) {
  await f.start('sendRecovery');
  const original = f.dispatch.getMockImplementation();
  f.dispatch.mockImplementation((transport, request, late) => {
    if (request.method !== 'GET') return original(transport, request, late);
    return parseAiResponse(
      new Response(OUTPUT, {
        headers: {
          'Content-Type': 'image/png',
          [RECOVERY_VERSION_HEADER]: RECOVERY_PROTOCOL,
          [RECOVERY_EXPIRES_HEADER]: String(f.latest().journal.createdAt + JOB_TTL_MS),
          [RECOVERY_DIGEST_HEADER]: recoveryDigest(OUTPUT),
          [RECOVERY_RECEIPT_HEADER]: DELIVERY_RECEIPT,
          ...(token === null ? {} : { 'X-Report-Token': token }),
        },
      }),
      request,
      new AbortController().signal,
      CREATED + 100
    );
  });
  await f.start('collectRecovery');
}
async function sentForm(f) {
  const request = f.transport.mock.calls.at(-1)[0];
  return new Response(request.body, {
    headers: { 'Content-Type': request.headers['Content-Type'] },
  }).formData();
}
it('adopts a checked refusal only after committed terminal storage and requires a separate gate and send', async () => {
  const f = reportingFixture();
  const source = f.latest();
  const before = JSON.stringify(source);
  await refuse(f);
  const receipt = f.latest();
  expect(receipt.recovery.state).toBe('terminal');
  expect(f.owner.getState().refusal).toEqual({ id: receipt.journal.id });
  expect(f.records.get(source.journal.id)).toBe(source);
  expect(JSON.stringify(source)).toBe(before);
  f.owner.reportRefusal(receipt.journal.id);
  await f.owner.sendPictureReport();
  expect(f.parent.request.mock.calls.at(-1)[0]).toBe('imageReport');
  expect(f.owner.getState().report.phase).toBe('gating');
  expect(f.transport).not.toHaveBeenCalled();
  f.confirm();
  expect(f.owner.getState().report.phase).toBe('confirm');
  expect(f.transport).not.toHaveBeenCalled();
  await f.owner.sendPictureReport();
  const form = await sentForm(f);
  expect([...form.keys()]).toEqual(['kind', 'drawing', 'style']);
  expect(form.get('kind')).toBe('false-positive-refusal');
  expect(form.get('style')).toBe(source.journal.style);
  expect(new Uint8Array(await form.get('drawing').arrayBuffer())).toEqual(INPUT);
  expect(form.has('output')).toBe(false);
  expect(f.transport.mock.calls[0][0].headers['X-Report-Token']).toBe(TOKEN);
  expect(f.owner.getState().report.phase).toBe('success');
});
it('reports exact admitted retained output and original bytes after ACK without generating another picture', async () => {
  const f = reportingFixture();
  await picture(f);
  const receipt = f.latest();
  expect(receipt.recovery.state).toBe('acknowledged');
  expect(f.transport).not.toHaveBeenCalled();
  f.owner.reportPicture(receipt.journal.result.uri);
  f.confirm();
  expect(f.owner.getState().report.preview.style).toBe(receipt.journal.style);
  await f.owner.sendPictureReport();
  const form = await sentForm(f);
  expect(new Uint8Array(await form.get('drawing').arrayBuffer())).toEqual(INPUT);
  expect(new Uint8Array(await form.get('output').arrayBuffer())).toEqual(OUTPUT);
  expect(f.transport.mock.calls[0][0].path).toBe('/api/report-image');
  expect(
    f.dispatch.mock.calls.filter(([, request]) => request.recovery.kind === 'admit')
  ).toHaveLength(1);
});
it.each([null, 'invalid token'])(
  'keeps a checked refusal without valid token unavailable: %s',
  async (token) => {
    const f = reportingFixture();
    await refuse(f, { token });
    expect(f.latest().recovery.state).toBe('terminal');
    expect(f.owner.getState().refusal).toBeNull();
    f.owner.reportRefusal(f.latest().journal.id);
    await f.owner.sendPictureReport();
    expect(f.owner.getState().report.phase).toBe('unavailable');
    expect(f.transport).not.toHaveBeenCalled();
  }
);
it.each([{ generic: true }, { advisory: true }])(
  'does not promote generic/advisory refusal %j into a report',
  async (options) => {
    const f = reportingFixture();
    await refuse(f, options);
    expect(f.owner.getState().refusal).toBeNull();
    f.owner.reportRefusal(f.latest().journal.id);
    expect(f.owner.getState().report.phase).toBe('unavailable');
    expect(f.transport).not.toHaveBeenCalled();
  }
);
it('keeps a committed terminal receipt after a lost callback without inventing report availability', async () => {
  const f = reportingFixture();
  const original = f.storage.recordRecoveryTerminal.getMockImplementation();
  f.storage.recordRecoveryTerminal.mockImplementationOnce(async (...args) => {
    await original(...args);
    throw new Error('Lost storage callback');
  });
  await refuse(f);
  expect(f.latest().recovery.state).toBe('terminal');
  expect(f.owner.getState().recovery).toBe(f.latest());
  expect(f.owner.getState().refusal).toBeNull();
  f.owner.reportRefusal(f.latest().journal.id);
  expect(f.owner.getState().report.phase).toBe('unavailable');
  expect(f.transport).not.toHaveBeenCalled();
});
it.each(['close', 'background', 'consent', 'dispose', 'vault-write', 'vault-remove'])(
  'retains a committed terminal receipt but publishes no report after %s during persistence',
  async (kind) => {
    const f = reportingFixture();
    const delayed = block(f.storage.recordRecoveryTerminal);
    f.dispatch.mockImplementationOnce((_, request) => refusalReply(f, request));
    await f.owner.sendRecovery();
    await delayed.started;
    f.revoke(kind);
    delayed.release();
    await f.idle();
    expect(f.latest().recovery.state).toBe('terminal');
    expect(f.owner.getState().recovery).toBe(f.latest());
    expect(f.owner.getState().refusal).toBeNull();
    expect(f.transport).not.toHaveBeenCalled();
  }
);
it.each(['close', 'consent', 'vault-write', 'vault-remove'])(
  'cannot capture original context or dispatch after %s during original admission',
  async (kind) => {
    const f = reportingFixture();
    const delayed = block(f.admit);
    await f.owner.sendRecovery();
    await delayed.started;
    f.revoke(kind);
    delayed.release();
    await f.idle();
    expect(f.dispatch).not.toHaveBeenCalled();
    expect(f.latest().recovery.state).toBe('submission-uncertain');
    expect(f.owner.getState().refusal).toBeNull();
  }
);
it.each(['close', 'consent', 'vault-write', 'vault-remove'])(
  'rechecks report permission and credential generation after %s during final credential readback',
  async (kind) => {
    const f = reportingFixture();
    await refuse(f);
    f.owner.reportRefusal(f.latest().journal.id);
    f.confirm();
    const delayed = block(f.rawVault.readReferenced);
    const sending = f.owner.sendPictureReport();
    await delayed.started;
    f.revoke(kind);
    delayed.release();
    await sending;
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.owner.getState().report.phase).toBe('idle');
  }
);
it('rejects changed original upload before raw dispatch or report preparation', async () => {
  const f = reportingFixture();
  f.storage.readRecoveryUpload.mockResolvedValueOnce(OUTPUT);
  await f.start('sendRecovery');
  expect(f.dispatch).not.toHaveBeenCalled();
  expect(f.owner.getState().refusal).toBeNull();
  expect(f.transport).not.toHaveBeenCalled();
});
it('rejects changed original credential returned at final report readback', async () => {
  const f = reportingFixture();
  await refuse(f);
  f.owner.reportRefusal(f.latest().journal.id);
  f.confirm();
  f.rawVault.readReferenced.mockResolvedValueOnce({ kind: 'free', installationId: 'd'.repeat(64) });
  await f.owner.sendPictureReport();
  expect(f.owner.getState().report.phase).toBe('error');
  expect(f.transport).not.toHaveBeenCalled();
});
it('allows explicit retry of a failed recovery report after duplicate settlement and close', async () => {
  const f = reportingFixture();
  await refuse(f);
  const id = f.latest().journal.id;
  f.transport.mockResolvedValueOnce(new Response('{}'));
  f.owner.reportRefusal(id);
  f.confirm();
  await f.owner.sendPictureReport();
  expect(f.owner.getState().report.phase).toBe('error');
  await f.start('collectRecovery');
  f.owner.cancelPictureReport();
  f.owner.reportRefusal(id);
  expect(f.owner.getState().report.phase).toBe('gating');
  f.confirm();
  await f.owner.sendPictureReport();
  expect(f.owner.getState().report.phase).toBe('success');
  expect(f.transport).toHaveBeenCalledTimes(2);
});
it('cannot reconstruct report proof from a restarted terminal receipt', async () => {
  const f = reportingFixture();
  await refuse(f);
  const receipt = f.latest();
  f.owner.dispose();
  const restarted = reportingFixture({ source: receipt });
  await restarted.start('collectRecovery');
  restarted.owner.reportRefusal(receipt.journal.id);
  await restarted.owner.sendPictureReport();
  expect(restarted.owner.getState().report.phase).toBe('unavailable');
  expect(restarted.transport).not.toHaveBeenCalled();
});
it('cannot reconstruct original report context from a restarted retained picture', async () => {
  const f = reportingFixture();
  await picture(f);
  const receipt = f.latest();
  f.owner.dispose();
  const restarted = reportingFixture({ source: receipt });
  await restarted.start('collectRecovery');
  restarted.owner.reportPicture(receipt.journal.result.uri);
  await restarted.owner.sendPictureReport();
  expect(restarted.owner.getState().report.phase).toBe('unavailable');
  expect(restarted.transport).not.toHaveBeenCalled();
});
it('suppresses late report acknowledgement after close without reopening resend', async () => {
  const f = reportingFixture();
  await refuse(f);
  f.owner.reportRefusal(f.latest().journal.id);
  f.confirm();
  let release;
  f.transport.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const sending = f.owner.sendPictureReport();
  await vi.waitFor(() => expect(f.transport).toHaveBeenCalledOnce(), {
    timeout: SETTLE_TIMEOUT_MS,
  });
  f.owner.close();
  release(new Response(JSON.stringify({ ok: true, reportId: REPORT_ID })));
  await sending;
  expect(f.owner.getState().report.phase).toBe('idle');
  expect(f.transport).toHaveBeenCalledOnce();
});

it('keeps retained storage after a lost callback without adopting reporting evidence', async () => {
  const f = reportingFixture();
  const original = f.storage.retainRecoveryResult.getMockImplementation();
  f.storage.retainRecoveryResult.mockImplementationOnce(async (...args) => {
    await original(...args);
    throw new Error('Lost retained callback');
  });
  await picture(f);
  expect(f.latest().recovery.state).toBe('retained');
  expect(f.owner.getState().recovery).toBe(f.latest());
  f.owner.reportPicture(f.latest().journal.result.uri);
  expect(f.owner.getState().report.phase).toBe('unavailable');
  expect(f.transport).not.toHaveBeenCalled();
  expect(
    f.dispatch.mock.calls.filter(([, request]) => request.recovery.kind === 'ack')
  ).toHaveLength(0);
});
it.each(['close', 'background', 'consent', 'dispose', 'vault-write', 'vault-remove'])(
  'publishes committed retained storage without report evidence after %s during persistence',
  async (kind) => {
    const f = reportingFixture();
    const delayed = block(f.storage.retainRecoveryResult);
    const collecting = picture(f);
    await delayed.started;
    f.revoke(kind);
    delayed.release();
    await collecting;
    expect(f.latest().recovery.state).toBe('retained');
    expect(f.owner.getState().recovery).toBe(f.latest());
    f.owner.reportPicture(f.latest().journal.result.uri);
    expect(f.owner.getState().report.phase).toBe('unavailable');
    expect(f.transport).not.toHaveBeenCalled();
    expect(
      f.dispatch.mock.calls.filter(([, request]) => request.recovery.kind === 'ack')
    ).toHaveLength(0);
  }
);
