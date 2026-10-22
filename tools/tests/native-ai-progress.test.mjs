// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { createAiProgress } from '../../src/ai/aiProgress.ts';

const NOW_MS = 100_000;
const FUTURE_START_MS = NOW_MS + 5_000;

afterEach(() => {
  vi.useRealTimers();
});

it('never publishes negative progress for a journal started in the future', () => {
  vi.useFakeTimers({
    now: NOW_MS,
    toFake: ['Date', 'requestAnimationFrame', 'cancelAnimationFrame'],
  });
  const progress = createAiProgress();
  progress.follow(
    { id: 1, startedAt: FUTURE_START_MS, phase: 'waiting', submitted: null, picture: null },
    'corner'
  );
  expect(progress.snapshot().value).toBe(0);
  vi.advanceTimersByTime(1_000);
  expect(progress.snapshot().value).toBeGreaterThanOrEqual(0);
  progress.dispose();
});
