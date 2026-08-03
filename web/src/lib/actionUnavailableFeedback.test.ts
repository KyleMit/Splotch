import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTION_UNAVAILABLE_CLASS,
  replayActionUnavailableFeedback,
} from './actionUnavailableFeedback';

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function mockAnimations(element: HTMLElement, finished: Promise<void>[]) {
  Object.defineProperty(element, 'getAnimations', {
    configurable: true,
    value: vi.fn(() => finished.map((promise) => ({ finished: promise }))),
  });
}

beforeEach(() => {
  document.body.innerHTML = '<button></button>';
});

describe('action unavailable feedback', () => {
  it('keeps the class until every running animation settles', async () => {
    const button = document.querySelector('button')!;
    const shake = deferred();
    const flash = deferred();
    mockAnimations(button, [shake.promise, flash.promise]);

    replayActionUnavailableFeedback(button);
    expect(button.classList.contains(ACTION_UNAVAILABLE_CLASS)).toBe(true);

    shake.resolve();
    await Promise.resolve();
    expect(button.classList.contains(ACTION_UNAVAILABLE_CLASS)).toBe(true);

    flash.resolve();
    await vi.waitFor(() => expect(button.classList.contains(ACTION_UNAVAILABLE_CLASS)).toBe(false));
  });

  it('clears the class when a hidden element starts no animations', async () => {
    const button = document.querySelector('button')!;
    mockAnimations(button, []);

    replayActionUnavailableFeedback(button);
    expect(button.classList.contains(ACTION_UNAVAILABLE_CLASS)).toBe(true);
    await vi.waitFor(() => expect(button.classList.contains(ACTION_UNAVAILABLE_CLASS)).toBe(false));
  });

  it('does not let a superseded replay clear the current cue', async () => {
    const button = document.querySelector('button')!;
    const first = deferred();
    const second = deferred();
    let callCount = 0;
    Object.defineProperty(button, 'getAnimations', {
      configurable: true,
      value: vi.fn(() => [{ finished: callCount++ === 0 ? first.promise : second.promise }]),
    });

    replayActionUnavailableFeedback(button);
    replayActionUnavailableFeedback(button);
    first.resolve();
    await Promise.resolve();
    expect(button.classList.contains(ACTION_UNAVAILABLE_CLASS)).toBe(true);

    second.resolve();
    await vi.waitFor(() => expect(button.classList.contains(ACTION_UNAVAILABLE_CLASS)).toBe(false));
  });
});
