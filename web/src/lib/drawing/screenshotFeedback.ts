export const SCREENSHOT_BUTTON_ID = 'screenshotButton';

const CAPTURE_FEEDBACK_CLASS = 'screenshot-capture-feedback';
const SUPPRESSED_FEEDBACK_CLASS = 'screenshot-suppressed-feedback';

function playButtonFeedback(className: string) {
  const button = document.getElementById(SCREENSHOT_BUTTON_ID);
  if (!button) return;
  button.classList.remove(CAPTURE_FEEDBACK_CLASS, SUPPRESSED_FEEDBACK_CLASS);
  void button.offsetWidth;
  button.classList.add(className);
}

export function playScreenshotFeedback() {
  playButtonFeedback(CAPTURE_FEEDBACK_CLASS);
}

export function playScreenshotSuppressedFeedback() {
  playButtonFeedback(SUPPRESSED_FEEDBACK_CLASS);
}
