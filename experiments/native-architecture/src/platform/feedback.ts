import { FEEDBACK_APP_VERSION } from '../feedback/feedbackCopy';
import { fetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import { Dimensions, Platform } from 'react-native';
import { FEEDBACK_URL, type FeedbackTransport } from '../feedback/feedbackTransport';
import {
  FEEDBACK_POLICY_FILE,
  MAX_FEEDBACK_POLICY_BYTES,
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
  const screen = Dimensions.get('screen');
  return {
    app: FEEDBACK_APP_VERSION,
    platform: Platform.OS,
    os: `${Platform.OS} ${Platform.Version}`,
    screen: `${Math.round(screen.width)} × ${Math.round(screen.height)}`,
    pixelRatio: String(screen.scale),
    display: 'Native app',
  };
}
export const feedbackOffline = () =>
  typeof navigator !== 'undefined' && 'onLine' in navigator && navigator.onLine === false;

export const feedbackPolicyStorage: FeedbackPolicyStorage = {
  async read() {
    const file = new File(Paths.document, FEEDBACK_POLICY_FILE);
    if (!file.exists) return null;
    if (file.size > MAX_FEEDBACK_POLICY_BYTES) throw new Error('Invalid feedback policy');
    return parseFeedbackPolicy(await file.text());
  },
  async write(mode) {
    const file = new File(Paths.document, FEEDBACK_POLICY_FILE);
    const snapshot = feedbackPolicySnapshot(mode);
    if (!file.exists) file.create();
    file.write(snapshot);
    if ((await file.text()) !== snapshot) throw new Error('Feedback protection was not saved');
  },
};
