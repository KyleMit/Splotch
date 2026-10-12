import { afterEach, expect, it, vi } from 'vitest';
import { createNativeAi } from '../../experiments/native-architecture/src/ai/generation.ts';

const INPUT = Uint8Array.from([137, 80, 78, 71]);
const INSTALLATION = 'a'.repeat(64);
const TOKEN = 'opaque.original-refusal-proof';
const REPORT_ID = '1723123456789-550e8400-e29b-41d4-a716-446655440000';
const SETTLE_TIMEOUT_MS = 1000;
const owners = [];
function fixture() {
  let journal = null;
  let upload;
  const receipt = (value) => ({ kind: 'prepared', journal: value });
  const storage = {
    read: vi.fn(async () => (journal ? { kind: 'native', receipt: receipt(journal) } : null)),
    prepare: vi.fn(async (value, _, bytes) => {
      journal = value;
      upload = bytes.slice();
      return receipt(value);
    }),
    readPreparedUpload: vi.fn(async () => upload.slice()),
    write: vi.fn(async (value) => {
      journal = value;
      return receipt(value);
    }),
    pictures: vi.fn(async () => []),
    retain: vi.fn(),
  };
  const parent = {
    consent: () => ({ enabled: true, epoch: 1 }),
    cancel: vi.fn(),
    request: vi.fn((_, action) => {
      action({ valid: () => true });
      return true;
    }),
  };
  const vault = {
    read: vi.fn(async () => null),
    write: vi.fn(),
    remove: vi.fn(),
    installationId: async () => INSTALLATION,
    pin: vi.fn(async () => ({ kind: 'free', reference: 'b'.repeat(64) })),
    readReferenced: vi.fn(async () => ({ kind: 'free', installationId: INSTALLATION })),
  };
  let reportReply = { ok: true, reportId: REPORT_ID };
  const transport = vi.fn(async (request) => {
    if (request.path === '/api/free-generation-grant')
      return new Response('{"ok":true,"remaining":10,"limit":10}');
    if (request.path === '/api/report-image') return new Response(JSON.stringify(reportReply));
    return new Response('{"ok":false,"error":"private provider refusal"}', {
      status: 422,
      headers: { 'X-Report-Token': TOKEN },
    });
  });
  const create = () => {
    const owner = createNativeAi({
      storage,
      vault,
      transport,
      parent,
      admit: async () => {},
      prepare: async () => ({
        bytes: INPUT.slice(),
        originalId: 'picture-1-fixture',
        originalModel: '{"version":5,"pageId":"blank","rainbow":0,"strokes":[]}',
      }),
    });
    owners.push(owner);
    return owner;
  };
  async function open(owner) {
    owner.open();
    owner.refresh();
    await vi.waitFor(() => expect(owner.getState().remaining).toBe(10), {
      timeout: SETTLE_TIMEOUT_MS,
    });
  }
  async function refuse(owner) {
    await open(owner);
    owner.chooseStyle('Clay');
    await owner.generate();
    await vi.waitFor(() => expect(owner.getState().journal?.phase).toBe('failed'), {
      timeout: SETTLE_TIMEOUT_MS,
    });
  }
  return {
    create,
    open,
    refuse,
    storage,
    parent,
    transport,
    unknownReport: () => {
      reportReply = { ok: true };
    },
  };
}
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
});
it('carries a refused generation into an explicit report with its submitted drawing, style and proof', async () => {
  const f = fixture();
  const owner = f.create();
  await f.refuse(owner);
  const state = owner.getState();
  expect(state.refusal).toEqual({ id: state.journal.id });
  expect(state.pictures).toEqual([]);
  expect(state.heldResult).toBeNull();
  expect(f.storage.retain).not.toHaveBeenCalled();
  expect(
    f.transport.mock.calls.filter(([request]) => request.path === '/api/report-image')
  ).toHaveLength(0);
  const reads = f.storage.read.mock.calls.length;
  owner.chooseStyle('Felt');
  owner.reportRefusal(state.refusal.id);
  expect(f.parent.request.mock.calls.at(-1)[0]).toBe('imageReport');
  expect(owner.getState().report).toMatchObject({
    phase: 'confirm',
    preview: { style: 'Clay', drawing: 'data:image/png;base64,iVBORw==' },
  });
  expect(
    f.transport.mock.calls.filter(([request]) => request.path === '/api/report-image')
  ).toHaveLength(0);
  await owner.sendPictureReport();
  const request = f.transport.mock.calls.at(-1)[0];
  expect(request.headers['X-Report-Token']).toBe(TOKEN);
  const form = await new Response(request.body, {
    headers: { 'Content-Type': request.headers['Content-Type'] },
  }).formData();
  expect(form.get('kind')).toBe('false-positive-refusal');
  expect(form.get('style')).toBe('Clay');
  expect(new Uint8Array(await form.get('drawing').arrayBuffer())).toEqual(INPUT);
  expect(form.has('output')).toBe(false);
  expect(f.storage.read).toHaveBeenCalledTimes(reads);
  expect(owner.getState().report.phase).toBe('success');
});
it('does not reconstruct or resend an unknown refusal report from the durable failed generation', async () => {
  const f = fixture();
  const owner = f.create();
  await f.refuse(owner);
  const id = owner.getState().refusal.id;
  f.unknownReport();
  owner.reportRefusal(id);
  await owner.sendPictureReport();
  expect(owner.getState().report.phase).toBe('unknown');
  owner.close();
  owner.open();
  owner.reportRefusal(id);
  expect(owner.getState().report.phase).toBe('unavailable');
  owner.dispose();
  const restarted = f.create();
  await f.open(restarted);
  expect(restarted.getState().journal.phase).toBe('failed');
  expect(restarted.getState().refusal).toBeNull();
  restarted.reportRefusal(id);
  await restarted.sendPictureReport();
  expect(restarted.getState().report.phase).toBe('unavailable');
  expect(
    f.transport.mock.calls.filter(([request]) => request.path === '/api/report-image')
  ).toHaveLength(1);
});
