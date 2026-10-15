// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { rateLimit, createIssue } = vi.hoisted(() => ({ rateLimit: vi.fn(), createIssue: vi.fn() }));
vi.mock('$lib/server/rateLimit', () => ({ rateLimit }));
vi.mock('$lib/server/github', async (original) => ({
  ...(await original<typeof import('$lib/server/github')>()),
  isReportingConfigured: () => true,
  createIssue,
}));
import { POST } from '../../routes/api/report/+server';
import { createNativeFeedback } from '../../../../experiments/native-architecture/src/feedback/feedback';
import { feedbackTransport } from '../../../../experiments/native-architecture/src/platform/feedback.web';
import { FEEDBACK_URL } from '../../../../experiments/native-architecture/src/feedback/feedbackTransport';
const FIXTURE_TIMEOUT_MS = 1000;
const wire: { input: string; init: RequestInit }[] = [];
function owner() {
  return createNativeFeedback({
    transport: feedbackTransport,
    device: () => ({ platform: 'iOS', os: 'iOS fixture', screen: '400 × 800' }),
    policyStorage: { read: async () => null, write: async () => {} },
    random: () => 0,
  });
}
async function send(kind: 'bug' | 'feature', includeDevice: boolean) {
  const feedback = owner();
  await feedback.loadPolicy();
  feedback.setKind(kind);
  feedback.setMessage('  Fixture #123 @someone ![image](https://invalid.example/pixel)  ');
  feedback.setIncludeDevice(includeDevice);
  feedback.preview();
  const snapshot = feedback.getState().preview;
  feedback.send();
  const gate = feedback.getState().gate;
  feedback.gateInput(String(gate.x * gate.y));
  feedback.gateAnswer();
  await vi.waitFor(() => expect(feedback.getState().delivery.status).not.toBe('sending'), {
    timeout: FIXTURE_TIMEOUT_MS,
  });
  return { feedback, snapshot };
}
beforeEach(() => {
  wire.length = 0;
  rateLimit.mockReset().mockReturnValue({ limited: false, retryAfter: 0 });
  createIssue.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('fetch', async (input: string, init: RequestInit) => {
    if (input !== FEEDBACK_URL) throw new Error('Unexpected fixture destination');
    wire.push({ input, init });
    const request = new Request(input, init);
    return POST({ request, getClientAddress: () => '203.0.113.10' } as unknown as Parameters<
      typeof POST
    >[0]);
  });
});
afterEach(() => vi.unstubAllGlobals());
describe('the native feedback caller through the real controlled report handler', () => {
  it('sends the exact reviewed bug body without credentials or images and files sanitized private support content', async () => {
    const { feedback, snapshot } = await send('bug', true);
    expect(wire).toHaveLength(1);
    expect(wire[0].input).toBe('https://splotch.art/api/report');
    expect(wire[0].init).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(JSON.parse(String(wire[0].init.body))).toEqual(snapshot?.body);
    expect(Object.keys(JSON.parse(String(wire[0].init.body))).sort()).toEqual([
      'device',
      'hp',
      'kind',
      'message',
    ]);
    expect(createIssue).toHaveBeenCalledOnce();
    expect(createIssue.mock.calls[0][0].labels).toEqual(['user-report', 'type:bug']);
    expect(createIssue.mock.calls[0][0].body).toContain('- **Operating system:** iOS fixture');
    expect(createIssue.mock.calls[0][0].body).toContain('\\#123');
    expect(createIssue.mock.calls[0][0].body).toContain('\\@someone');
    expect(feedback.getState().delivery.status).toBe('success');
    feedback.dispose();
  });
  it('sends an idea without device details even after a previous opt-in', async () => {
    const { feedback } = await send('feature', true);
    expect(JSON.parse(String(wire[0].init.body))).toEqual({
      kind: 'feature',
      message: 'Fixture #123 @someone ![image](https://invalid.example/pixel)',
      hp: '',
    });
    expect(createIssue.mock.calls[0][0].labels).toEqual(['user-report', 'type:feature']);
    expect(createIssue.mock.calls[0][0].body).not.toContain('Operating system');
    feedback.dispose();
  });
  it('shows the actual route throttle without performing a support write', async () => {
    rateLimit.mockReturnValue({ limited: true, retryAfter: 12 });
    const { feedback } = await send('bug', false);
    expect(feedback.getState().delivery).toMatchObject({
      status: 'throttled',
      retryAfterSeconds: 12,
    });
    expect(createIssue).not.toHaveBeenCalled();
    feedback.dispose();
  });
  it('shows a safe error for the real handler failure without exposing its exception', async () => {
    createIssue.mockRejectedValue(new Error('fixture private provider failure'));
    const { feedback } = await send('bug', false);
    expect(feedback.getState().delivery.status).toBe('error');
    expect(JSON.stringify(feedback.getState().delivery)).not.toContain('private provider');
    expect(feedback.getState().draft.message).toContain('Fixture');
    feedback.dispose();
  });
});
