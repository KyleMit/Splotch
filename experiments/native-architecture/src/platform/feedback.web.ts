import { osLabelFromUserAgent } from '../feedback/osLabel';
import { FEEDBACK_APP_VERSION } from '../feedback/feedbackCopy';
import { FEEDBACK_URL, type FeedbackTransport } from '../feedback/feedbackTransport';
import {
  FEEDBACK_POLICY_KEY,
  feedbackPolicySnapshot,
  parseFeedbackPolicy,
} from '../feedback/feedbackPolicy';
import type { FeedbackPolicyStorage } from '../feedback/feedback';
import type { DeviceInfo } from '../feedback/deviceReport';

export const feedbackTransport: FeedbackTransport = (body, signal) =>
  fetch(FEEDBACK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
    credentials: 'omit',
    redirect: 'error',
  });
export function feedbackDevice(): DeviceInfo {
  return {
    app: FEEDBACK_APP_VERSION,
    platform: 'Web',
    os: osLabelFromUserAgent(navigator.userAgent),
    browser: navigator.userAgent,
    language: navigator.language || '',
    viewport: `${innerWidth} × ${innerHeight}`,
    screen: `${screen.width} × ${screen.height}`,
    pixelRatio: String(devicePixelRatio),
    display: matchMedia('(display-mode: standalone)').matches ? 'Installed (PWA)' : 'Browser tab',
    online: navigator.onLine ? 'Yes' : 'No',
  };
}
export const feedbackPolicyStorage: FeedbackPolicyStorage = {
  async read() {
    return parseFeedbackPolicy(localStorage.getItem(FEEDBACK_POLICY_KEY));
  },
  async write(mode) {
    const snapshot = feedbackPolicySnapshot(mode);
    localStorage.setItem(FEEDBACK_POLICY_KEY, snapshot);
    if (localStorage.getItem(FEEDBACK_POLICY_KEY) !== snapshot)
      throw new Error('Feedback protection was not saved');
  },
};
