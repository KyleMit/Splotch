import {
  ACTION_UNAVAILABLE_CLASS,
  replayActionUnavailableFeedback,
} from '$lib/actionUnavailableFeedback';

export const SCREENSHOT_BUTTON_ID = 'screenshotButton';

const CAPTURE_FEEDBACK_CLASS = 'screenshot-capture-feedback';

function screenshotButton() {
  return document.getElementById(SCREENSHOT_BUTTON_ID);
}

export function playScreenshotFeedback() {
  const button = screenshotButton();
  if (!button) return;
  button.classList.remove(CAPTURE_FEEDBACK_CLASS, ACTION_UNAVAILABLE_CLASS);
  void button.offsetWidth;
  button.classList.add(CAPTURE_FEEDBACK_CLASS);
}

export function playScreenshotSuppressedFeedback() {
  const button = screenshotButton();
  button?.classList.remove(CAPTURE_FEEDBACK_CLASS);
  replayActionUnavailableFeedback(button);
}
