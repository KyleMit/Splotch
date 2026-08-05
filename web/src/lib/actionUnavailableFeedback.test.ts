import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTION_UNAVAILABLE_CLASS,
  replayActionUnavailableFeedback,
} from './actionUnavailableFeedback';

interface MockAnimation {
  animationName?: string;
  finished: Promise<void>;
}

function mockAnimations(element: HTMLElement, animations: MockAnimation[]) {
  Object.defineProperty(element, 'getAnimations', {
    configurable: true,
    value: vi.fn(() => animations),
  });
}

beforeEach(() => {
  document.body.innerHTML = '<button></button>';
});

describe('action unavailable feedback', () => {
  it('keeps the class until every running animation settles', async () => {
    const button = document.querySelector('button')!;
    const shake = Promise.withResolvers<void>();
    const flash = Promise.withResolvers<void>();
    mockAnimations(button, [
      { animationName: 'action-unavailable-shake', finished: shake.promise },
      { animationName: 'action-unavailable-flash', finished: flash.promise },
    ]);

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

  it('does not let unrelated animations delay cue cleanup', async () => {
    const button = document.querySelector('button')!;
    const cue = Promise.withResolvers<void>();
    const transition = Promise.withResolvers<void>();
    const spinner = Promise.withResolvers<void>();
    mockAnimations(button, [
      { finished: transition.promise },
      { animationName: 'ai-spin', finished: spinner.promise },
      { animationName: 'action-unavailable-shake', finished: cue.promise },
    ]);

    replayActionUnavailableFeedback(button);
    cue.resolve();

    await vi.waitFor(() => expect(button.classList.contains(ACTION_UNAVAILABLE_CLASS)).toBe(false));
  });

  it('does not let a superseded replay clear the current cue', async () => {
    const button = document.querySelector('button')!;
    const first = Promise.withResolvers<void>();
    const second = Promise.withResolvers<void>();
    let callCount = 0;
    Object.defineProperty(button, 'getAnimations', {
      configurable: true,
      value: vi.fn(() => [
        {
          animationName: 'action-unavailable-shake',
          finished: callCount++ === 0 ? first.promise : second.promise,
        },
      ]),
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
