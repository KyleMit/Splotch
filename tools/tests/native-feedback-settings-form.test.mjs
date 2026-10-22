import { describe, expect, it, vi } from 'vitest';
import { createNativeFeedback } from '../../src/feedback/feedback.ts';

// The Settings Feedback section drives the owner through submit, reset and deviceRows: one
// Send report behind the shared grown-up check, a fresh draft per visit, and the device rows its
// disclosure lists. The parent port stands in for the product's Parent Center gate.
function fixture() {
  const checks = [];
  const parent = {
    request: vi.fn((feature, action) => {
      checks.push({ feature, action });
      return true;
    }),
    cancel: vi.fn(),
  };
  const device = vi.fn(() => ({ platform: 'iOS', screen: '100 × 200', secret: 'drop me' }));
  const replies = [];
  const transport = vi.fn(
    () =>
      new Promise((resolve) => {
        replies.push(resolve);
      })
  );
  const owner = createNativeFeedback({
    transport,
    device,
    offline: () => false,
    policyStorage: { read: async () => null, write: async () => {} },
    parent,
  });
  const pass = () => checks.at(-1).action({ valid: () => true });
  return { owner, parent, transport, device, checks, pass, replies };
}

describe('the Settings feedback form', () => {
  it('sends the checked draft after the grown-up check without opening any sheet', async () => {
    const f = fixture();
    await f.owner.loadPolicy();
    f.owner.setMessage('  The crayon is stuck  ');
    f.owner.setIncludeDevice(true);
    f.owner.submit();
    expect(f.owner.getState().open).toBe(false);
    expect(f.parent.request).toHaveBeenCalledWith('feedback', expect.any(Function));
    expect(f.transport).not.toHaveBeenCalled();
    f.pass();
    expect(f.transport).toHaveBeenCalledOnce();
    expect(f.transport.mock.calls[0][0]).toEqual({
      kind: 'bug',
      message: 'The crayon is stuck',
      hp: '',
      device: { platform: 'iOS', screen: '100 × 200' },
    });
  });

  it('withdraws a report whose draft changed while the check was open', async () => {
    const f = fixture();
    await f.owner.loadPolicy();
    f.owner.setMessage('First');
    f.owner.submit();
    const stale = f.checks.at(-1);
    f.owner.setMessage('Second');
    stale.action({ valid: () => true });
    expect(f.transport).not.toHaveBeenCalled();
  });

  it('asks for a description instead of sending an empty draft', async () => {
    const f = fixture();
    await f.owner.loadPolicy();
    f.owner.setMessage('   ');
    f.owner.submit();
    expect(f.parent.request).not.toHaveBeenCalled();
    expect(f.owner.getState().validation).toBe('Please type a short description.');
  });

  it("detaches an earlier visit's report on reset, so it neither holds nor reports into the next", async () => {
    const f = fixture();
    await f.owner.loadPolicy();
    f.owner.setMessage('First visit');
    f.owner.submit();
    f.pass();
    expect(f.owner.getState().delivery.status).toBe('sending');
    f.owner.reset();
    expect(f.owner.getState().delivery.status).toBe('idle');
    f.owner.setMessage('Second visit, unsent');
    f.replies[0](new Response('{"ok":true}'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(f.owner.getState().delivery.status).toBe('idle');
    expect(f.owner.getState().draft.message).toBe('Second visit, unsent');
    f.owner.submit();
    f.pass();
    expect(f.transport).toHaveBeenCalledTimes(2);
    expect(f.transport.mock.calls[0][1].aborted).toBe(false);
  });

  it('starts each visit from an empty draft and cancels a check the old draft raised', async () => {
    const f = fixture();
    await f.owner.loadPolicy();
    f.owner.setKind('feature');
    f.owner.setMessage('An idea');
    f.owner.submit();
    f.owner.reset();
    expect(f.parent.cancel).toHaveBeenCalledWith('feedback');
    expect(f.owner.getState().draft).toEqual({ kind: 'bug', message: '', includeDevice: false });
    f.pass();
    expect(f.transport).not.toHaveBeenCalled();
  });

  it('lists the sanitized device rows the report would attach, and none when they are unavailable', () => {
    const f = fixture();
    expect(f.owner.deviceRows()).toEqual([
      { label: 'Platform', value: 'iOS' },
      { label: 'Screen', value: '100 × 200' },
    ]);
    f.device.mockImplementation(() => {
      throw new Error('no device');
    });
    expect(f.owner.deviceRows()).toEqual([]);
  });
});
