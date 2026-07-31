export const SCREENSHOT_BUTTON_ID = 'screenshotButton';

export function playScreenshotFeedback() {
  const button = document.getElementById(SCREENSHOT_BUTTON_ID);
  if (!button) return;
  button.classList.remove('screenshot-capture-feedback');
  void button.offsetWidth;
  button.classList.add('screenshot-capture-feedback');
}
