// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  PARENT_GATE_SUCCESS_HOLD_MS,
  PARENT_GATE_ERROR_VISIBLE_MS,
} from '../../experiments/native-architecture/src/parentCenter/parentGate.ts';
import { createScreen, files } from './native-drawing-screen-harness.mjs';

let screen;
async function input(label, value) {
  const field = screen.container.querySelector(`[aria-label="${label}"]`);
  expect(field).not.toBeNull();
  await act(async () => {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function solve() {
  const match = screen.container.textContent.match(/(\d) × (\d)/);
  expect(match).not.toBeNull();
  await input('Grown-up answer', String(Number(match[1]) * Number(match[2])));
  await screen.click('Check answer');
  await act(async () => vi.advanceTimersByTimeAsync(PARENT_GATE_SUCCESS_HOLD_MS));
}
beforeEach(async () => {
  vi.useFakeTimers();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  files.settingsRead.mockReset().mockResolvedValue('{"version":1,"soundEnabled":false}');
  files.settingsWrite.mockReset().mockResolvedValue(undefined);
  files.aiSend.mockReset();
  files.aiVaultRead.mockClear();
  files.feedbackRead.mockClear();
  files.feedbackWrite.mockClear();
  files.lock.mockReturnValue(() => {});
  files.platform = 'android';
  files.retainClosingModal = false;
  files.dismissModal = null;
  screen = createScreen();
  await act(async () => screen.mount());
});
afterEach(() => {
  screen?.close();
  vi.useRealTimers();
  files.platform = 'android';
  files.retainClosingModal = false;
  files.dismissModal = null;
  vi.clearAllMocks();
});
it('mounts ungated Settings, gated Parent Center, persisted AI opt-in and a panel with no eager remote request', async () => {
  expect(screen.button('AI picture')).toBeUndefined();
  expect(files.aiSend).not.toHaveBeenCalled();
  expect(files.aiVaultRead).not.toHaveBeenCalled();
  await screen.menuClick('Settings');
  expect(screen.container.textContent).toContain('Appearance');
  expect(screen.container.textContent).not.toContain('Grown-ups only');
  await screen.click('Manage Parent Center');
  expect(screen.container.textContent).toContain('Grown-ups only');
  expect(files.settingsWrite).not.toHaveBeenCalled();
  await solve();
  await screen.click('Enable AI picture creation');
  expect(JSON.parse(files.settingsWrite.mock.calls[0][0])).toMatchObject({
    version: 16,
    coloringBookEnabled: true,
    aiEnabled: true,
    parentPolicies: {
      ai: 'always',
      imageReport: 'always',
      externalLinks: 'always',
      feedback: 'always',
      parentCenter: 'always',
    },
  });
  await screen.click('Keep drawing');
  await screen.click('AI picture');
  expect(screen.container.textContent).toContain('Check AI allowance');
  expect(files.aiSend).not.toHaveBeenCalled();
  expect(files.aiVaultRead).not.toHaveBeenCalled();
  expect(files.feedbackRead).not.toHaveBeenCalled();
  expect(files.feedbackWrite).not.toHaveBeenCalled();
});
it('cancels an unsolved challenge and restores drawing without executing an AI intent', async () => {
  await screen.click('Parent Center');
  await screen.click('Cancel challenge');
  expect(screen.container.textContent).not.toContain('Grown-ups only');
  await screen.click('Draw fixture stroke');
  expect(JSON.parse(screen.paper()).strokes).toHaveLength(1);
  expect(files.aiSend).not.toHaveBeenCalled();
  expect(files.settingsWrite).not.toHaveBeenCalled();
});
async function finishDismissal() {
  const dismiss = files.dismissModal;
  expect(dismiss).toBeTypeOf('function');
  files.dismissModal = null;
  await act(async () => dismiss());
  expect(screen.container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
}
it('waits for the outgoing iOS Settings modal before showing its shared gate and Parent Center', async () => {
  files.platform = 'ios';
  files.retainClosingModal = true;
  await screen.menuClick('Settings');
  await finishDismissal();
  await screen.click('Manage Parent Center');
  expect(screen.container.textContent).not.toContain('Grown-ups only');
  expect(screen.container.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  await finishDismissal();
  expect(screen.container.textContent).toContain('Grown-ups only');
  await solve();
  expect(screen.button('Enable AI picture creation')).toBeUndefined();
  await finishDismissal();
  expect(screen.button('Enable AI picture creation')).toBeDefined();
});
it('routes iOS Feedback Send through one dismissed modal and retargets its challenge without sending the abandoned draft', async () => {
  files.platform = 'ios';
  files.retainClosingModal = true;
  await screen.menuClick('Send Feedback');
  await finishDismissal();
  await input('Feedback message', 'One modal report');
  await screen.click('Review feedback');
  await screen.click('Send privately');
  expect(screen.container.textContent).not.toContain('Grown-ups only');
  expect(files.feedbackSend).not.toHaveBeenCalled();
  await finishDismissal();
  expect(screen.container.textContent).toContain('Grown-ups only');
  await screen.click('Cancel challenge');
  await finishDismissal();
  expect(screen.container.textContent).toContain('One modal report');
  await screen.click('Send privately');
  await finishDismissal();
  await screen.click('Manage these checks in Settings › Parent Center');
  await solve();
  expect(screen.button('Enable AI picture creation')).toBeUndefined();
  await finishDismissal();
  expect(screen.button('Enable AI picture creation')).toBeDefined();
  expect(files.feedbackSend).not.toHaveBeenCalled();
});
it('routes iOS AI allowance and Send challenges without closing the AI service or presenting sibling modals', async () => {
  files.platform = 'ios';
  files.retainClosingModal = true;
  await screen.click('Parent Center');
  await solve();
  await finishDismissal();
  await screen.click('Enable AI picture creation');
  await screen.click('Keep drawing');
  const dismiss = files.dismissModal;
  files.dismissModal = null;
  await act(async () => dismiss());
  await screen.click('AI picture');
  files.aiSend.mockResolvedValue(new Response('{"ok":true,"remaining":10,"limit":10}'));
  await screen.click('Check AI allowance');
  expect(files.aiSend).not.toHaveBeenCalled();
  expect(screen.container.textContent).not.toContain('Grown-ups only');
  await finishDismissal();
  await solve();
  await finishDismissal();
  expect(files.aiSend).toHaveBeenCalledOnce();
  files.capture.mockResolvedValue('invalid controlled PNG');
  await screen.click('Send drawing for AI');
  expect(screen.container.textContent).not.toContain('Grown-ups only');
  await finishDismissal();
  await screen.click('Cancel challenge');
  await finishDismissal();
  expect(screen.button('Send drawing for AI')).toBeDefined();
  expect(files.capture).not.toHaveBeenCalled();
  expect(files.aiSend).toHaveBeenCalledOnce();
});

async function mountWithTimers() {
  screen.close();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-11T00:00:00Z'));
  screen = createScreen();
  await act(async () => screen.mount());
}
async function changeForeground(next) {
  await act(async () => {
    for (const listener of files.appStateListeners) listener(next);
  });
}
async function wrongAnswer() {
  await input('Grown-up answer', '0');
  await screen.click('Check answer');
}
it('keeps mounted drawing and an idle challenge timer-free, schedules a wrong-answer shake, and stops on dismissal/disposal', async () => {
  await mountWithTimers();
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => vi.advanceTimersByTimeAsync(60_000));
  expect(vi.getTimerCount()).toBe(0);
  await screen.click('Parent Center');
  expect(vi.getTimerCount()).toBe(0);
  await wrongAnswer();
  expect(vi.getTimerCount()).toBe(1);
  await act(async () => vi.advanceTimersByTimeAsync(400));
  expect(vi.getTimerCount()).toBe(1);
  await act(async () => vi.advanceTimersByTimeAsync(PARENT_GATE_ERROR_VISIBLE_MS - 400));
  expect(vi.getTimerCount()).toBe(0);
  await wrongAnswer();
  expect(vi.getTimerCount()).toBe(1);
  await screen.click('Cancel challenge');
  expect(vi.getTimerCount()).toBe(0);
  await screen.click('Parent Center');
  await act(async () => vi.advanceTimersByTimeAsync(400));
  await wrongAnswer();
  expect(vi.getTimerCount()).toBe(1);
  screen.close();
  screen = null;
  expect(vi.getTimerCount()).toBe(0);
  expect(files.appStateListeners.size).toBe(0);
});
it('suspends a mounted lockout in background and reevaluates its wall clock when the challenge is reopened', async () => {
  await mountWithTimers();
  await screen.click('Parent Center');
  for (let index = 0; index < 3; index += 1) {
    await wrongAnswer();
    await act(async () => vi.advanceTimersByTimeAsync(400));
  }
  expect(screen.container.textContent).toContain('Too many tries');
  expect(vi.getTimerCount()).toBe(1);
  await changeForeground('background');
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => vi.advanceTimersByTimeAsync(31_000));
  await changeForeground('active');
  await screen.click('Parent Center');
  expect(screen.container.textContent).not.toContain('Too many tries');
  expect(vi.getTimerCount()).toBe(0);
});
it('expires visible and closed Feedback throttles without resending or leaving timers', async () => {
  await mountWithTimers();
  let releaseReply = null;
  files.feedbackSend.mockImplementation(
    () =>
      new Promise((resolve) => {
        releaseReply = resolve;
      })
  );
  async function finishThrottle() {
    const release = releaseReply;
    expect(release).toBeTypeOf('function');
    releaseReply = null;
    await act(async () => {
      release(
        new Response('{"ok":false,"error":"Please wait"}', {
          status: 429,
          headers: { 'Retry-After': '3' },
        })
      );
    });
    expect(screen.container.textContent).toContain('Too many reports');
  }
  await screen.menuClick('Send Feedback');
  await input('Feedback message', 'Controlled throttle');
  await screen.click('Review feedback');
  await screen.click('Send privately');
  await solve();
  await finishThrottle();
  expect(screen.container.textContent).toContain('Too many reports');
  expect(vi.getTimerCount()).toBe(1);
  await act(async () => vi.advanceTimersByTimeAsync(3_000));
  expect(screen.container.textContent).not.toContain('Too many reports');
  expect(screen.container.textContent).toContain('Controlled throttle');
  expect(screen.button('Send privately').disabled).toBe(false);
  expect(files.feedbackSend).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  await screen.click('Send privately');
  await solve();
  await finishThrottle();
  expect(vi.getTimerCount()).toBe(1);
  await screen.click('Close feedback');
  expect(vi.getTimerCount()).toBe(1);
  await act(async () => vi.advanceTimersByTimeAsync(3_000));
  expect(vi.getTimerCount()).toBe(0);
  expect(files.feedbackSend).toHaveBeenCalledTimes(2);
});
