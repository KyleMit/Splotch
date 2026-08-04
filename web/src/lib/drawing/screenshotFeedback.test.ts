import { beforeEach, describe, expect, it } from 'vitest';
import { ACTION_UNAVAILABLE_CLASS } from '$lib/actionUnavailableFeedback';
import {
  SCREENSHOT_BUTTON_ID,
  playScreenshotFeedback,
  playScreenshotSuppressedFeedback,
} from './screenshotFeedback';

beforeEach(() => {
  document.body.innerHTML = `<button id="${SCREENSHOT_BUTTON_ID}"><span data-icon="camera"></span></button>`;
});

describe('screenshot feedback', () => {
  it('distinguishes a completed capture attempt from a cooldown tap', () => {
    const button = document.getElementById(SCREENSHOT_BUTTON_ID)!;

    playScreenshotFeedback();
    expect(button.classList.contains('screenshot-capture-feedback')).toBe(true);

    playScreenshotSuppressedFeedback();
    expect(button.classList.contains('screenshot-capture-feedback')).toBe(false);
    expect(button.classList.contains(ACTION_UNAVAILABLE_CLASS)).toBe(true);
  });

  it('forces a reflow before every unavailable cue replay', () => {
    const button = document.getElementById(SCREENSHOT_BUTTON_ID)!;
    let reflowCount = 0;
    const classAtReflow: boolean[] = [];
    Object.defineProperty(button, 'offsetWidth', {
      configurable: true,
      get() {
        reflowCount += 1;
        classAtReflow.push(button.classList.contains(ACTION_UNAVAILABLE_CLASS));
        return 0;
      },
    });

    playScreenshotSuppressedFeedback();
    playScreenshotSuppressedFeedback();

    expect(reflowCount).toBe(2);
    expect(classAtReflow).toEqual([false, false]);
    expect(button.classList.contains(ACTION_UNAVAILABLE_CLASS)).toBe(true);
  });
});
