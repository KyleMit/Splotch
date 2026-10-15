// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PARENT_GATE_SUCCESS_HOLD_MS } from '../../experiments/native-architecture/src/parentCenter/parentGate.ts';
import { NETWORK_ERROR_MESSAGE } from '../../web/src/lib/latestRequest.ts';
const SLOW_REPORT_MS = 60000;
import { createScreen, files } from './native-drawing-screen-harness.mjs';
let screen;
let finish;
const COUNTDOWN_TEST_MS = 3000;
async function input(label, value) {
  const field = screen.container.querySelector(`[aria-label="${label}"]`);
  expect(field).not.toBeNull();
  await act(async () => {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function openFeedback() {
  const opener = [...screen.container.querySelectorAll('button')].find(
    (button) => button.getAttribute('aria-label') === 'Drawing tools'
  );
  expect(opener).toBeDefined();
  await screen.click(opener.getAttribute('aria-label'));
  await screen.click('Send Feedback');
}
async function solve() {
  expect(screen.container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(screen.dialog().getAttribute('aria-label')).toBe('Grown-ups only');
  const beforeRequests = files.feedbackSend.mock.calls.length;
  const match = screen.container.textContent.match(/(\d) × (\d)/);
  expect(match).not.toBeNull();
  await input('Grown-up answer', String(Number(match[1]) * Number(match[2])));
  expect(files.feedbackSend).toHaveBeenCalledTimes(beforeRequests);
  await screen.click('Check answer');
  await act(async () => vi.advanceTimersByTimeAsync(PARENT_GATE_SUCCESS_HOLD_MS));
}
beforeEach(async () => {
  vi.useFakeTimers();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  files.lock.mockReturnValue(() => {});
  files.settingsRead.mockResolvedValue('{"version":1,"soundEnabled":false}');
  files.feedbackRead.mockReset().mockResolvedValue(null);
  files.feedbackWrite.mockReset().mockResolvedValue(undefined);
  files.feedbackSend.mockReset().mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  screen = createScreen();
  await act(async () => screen.mount());
});
afterEach(async () => {
  await act(async () => screen.close());
  vi.clearAllMocks();
  vi.useRealTimers();
});
describe('real RN drawing screen feedback caller', () => {
  it('previews bug consent, gates sending, keeps drawing while in flight and preserves a newer draft on reopen', async () => {
    await openFeedback();
    expect(screen.container.textContent).toContain('private support issue');
    await input('Feedback message', 'Native mounted bug');
    await screen.click('Include device details');
    await screen.click('Review feedback');
    expect(screen.container.textContent).toContain('Platform: iOS');
    expect(screen.container.textContent).toContain('Screen: 400 × 800');
    expect(files.feedbackSend).not.toHaveBeenCalled();
    await screen.click('Send privately');
    expect(screen.container.textContent).toContain('Grown-ups only');
    await solve();
    expect(files.feedbackSend).toHaveBeenCalledOnce();
    expect(files.feedbackSend.mock.calls[0][0]).toEqual({
      kind: 'bug',
      message: 'Native mounted bug',
      hp: '',
      device: { platform: 'iOS', screen: '400 × 800' },
    });
    await screen.click('Close feedback');
    expect(
      screen.container.querySelector('[aria-label="Send Feedback"][role="dialog"]')
    ).toBeNull();
    await screen.click('Draw fixture stroke');
    expect(JSON.parse(screen.paper()).strokes).toHaveLength(1);
    await openFeedback();
    await screen.click('Edit feedback');
    await input('Feedback message', 'New draft while sending');
    await act(async () => {
      finish(new Response('{"ok":true}'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.container.querySelector('[aria-label="Feedback message"]').value).toBe(
      'New draft while sending'
    );
    expect(screen.container.textContent).toContain('Thanks for your feedback.');
  });
  it.each([
    [503, '{"ok":false,"error":"Reporting is not available"}', 'Reporting is not available'],
    [200, '{"unexpected":true}', 'Could not read the server response.'],
    [429, '{"ok":false,"error":"throttle"}', 'throttle'],
  ])(
    'shows a visible safe outcome from status %s and preserves the reviewed draft',
    async (status, body, copy) => {
      await openFeedback();
      await input('Feedback message', 'Keep this draft');
      await screen.click('Review feedback');
      await screen.click('Send privately');
      await solve();
      await act(async () => {
        finish(new Response(body, { status, headers: { 'Retry-After': '12' } }));
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.container.textContent).toContain(copy);
      expect(screen.container.textContent).not.toContain('private provider detail');
      expect(screen.container.textContent).toContain('Keep this draft');
      expect(files.feedbackSend).toHaveBeenCalledOnce();
    }
  );
  it('shows an offline outcome from a failed native connection without surfacing the exception', async () => {
    files.feedbackSend.mockRejectedValue(new Error('private transport detail'));
    await openFeedback();
    await input('Feedback message', 'Offline draft');
    await screen.click('Review feedback');
    await screen.click('Send privately');
    await solve();
    expect(screen.container.textContent).toContain(NETWORK_ERROR_MESSAGE);
    expect(screen.container.textContent).not.toContain('private transport detail');
    expect(
      [...screen.container.querySelectorAll('[aria-live="polite"]')].map((node) => node.textContent)
    ).toContain(NETWORK_ERROR_MESSAGE);
    expect(screen.button('Try sending again')).toBeDefined();
    await screen.click('Edit feedback');
    await input('Feedback message', 'Unrelated first send');
    await screen.click('Review feedback');
    expect(screen.button('Try sending again')).toBeUndefined();
    expect(screen.button('Send privately')).toBeDefined();
    expect(screen.container.textContent).not.toContain(NETWORK_ERROR_MESSAGE);
  });
  it('keeps feedback typing and settled report status outside canvas renders', async () => {
    await act(async () => screen.close());
    vi.useFakeTimers();
    screen = createScreen();
    await screen.mount();
    await openFeedback();
    const rendered = files.surfaceRender.mock.calls.length;
    for (const message of ['R', 'Re', 'Ren', 'Rend', 'Render'])
      await input('Feedback message', message);
    await screen.click('Review feedback');
    expect(files.surfaceRender).toHaveBeenCalledTimes(rendered);
    await screen.click('Send privately');
    await input('Grown-up answer', '0');
    await act(async () => vi.advanceTimersByTimeAsync(COUNTDOWN_TEST_MS));
    expect(files.feedbackSend).not.toHaveBeenCalled();
    await solve();
    await act(async () => {
      finish(
        new Response('{"ok":false,"error":"throttle"}', {
          status: 429,
          headers: { 'Retry-After': '12' },
        })
      );
      await vi.advanceTimersByTimeAsync(0);
    });
    await screen.click('Close feedback');
    const closed = files.surfaceRender.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(COUNTDOWN_TEST_MS));
    expect(files.surfaceRender).toHaveBeenCalledTimes(closed);
    await openFeedback();
    expect(screen.container.textContent).toContain('throttle');
    expect(files.feedbackSend).toHaveBeenCalledOnce();
    await screen.click('Edit feedback');
    await input('Feedback message', 'New throttled report');
    await screen.click('Review feedback');
    expect(screen.button('Send privately').disabled).toBe(false);
  });
  it('keeps a slow report sending and supports explicit cancellation', async () => {
    await openFeedback();
    await input('Feedback message', 'Slow draft');
    await screen.click('Review feedback');
    await screen.click('Send privately');
    await solve();
    await act(async () => vi.advanceTimersByTimeAsync(SLOW_REPORT_MS));
    expect(screen.button('Cancel sending'), screen.container.textContent).toBeDefined();
    expect(files.feedbackSend.mock.calls[0][1].aborted).toBe(false);
    expect(files.feedbackSend).toHaveBeenCalledOnce();
    await screen.click('Cancel sending');
    expect(screen.container.textContent).toContain('Sending stopped');
  });
  it('cancels a challenge without sending and omits device consent for an idea', async () => {
    await openFeedback();
    await input('Feedback message', 'Add more brushes');
    await screen.click('I have an idea');
    expect(screen.button('Include device details')).toBeUndefined();
    await screen.click('Review feedback');
    expect(screen.container.textContent).toContain('Device details: not included');
    await screen.click('Send privately');
    await screen.click('Cancel challenge');
    expect(files.feedbackSend).not.toHaveBeenCalled();
    expect(screen.container.textContent).toContain('Add more brushes');
    expect(screen.dialog().getAttribute('aria-label')).toBe('Send Feedback');
    await screen.click('Send privately');
    await solve();
    expect(files.feedbackSend.mock.calls[0][0]).toEqual({
      kind: 'feature',
      message: 'Add more brushes',
      hp: '',
    });
    await act(async () =>
      finish(new Response('{"ok":false,"error":"Fixture error"}', { status: 503 }))
    );
  });
});
