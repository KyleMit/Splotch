import { APP_VERSION } from './appVersion';
import { fetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import { Dimensions, NativeModules, Platform } from 'react-native';
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

function nativeDevice(): { os: string; device: string; language: string } {
  const language = Intl.DateTimeFormat().resolvedOptions().locale.split('-')[0];
  if (Platform.OS === 'android')
    return {
      os: `android ${Platform.constants.Release}`,
      device: `${Platform.constants.Manufacturer} ${Platform.constants.Model}`.trim(),
      language,
    };
  const module: unknown = NativeModules.SplotchFeedbackDevice;
  if (!module || typeof module !== 'object') throw new Error('Device details are unavailable');
  const os: unknown = Reflect.get(module, 'os');
  const model: unknown = Reflect.get(module, 'model');
  if (typeof os !== 'string' || typeof model !== 'string' || !os || !model)
    throw new Error('Device details are unavailable');
  return { os, device: `Apple ${model}`, language };
}

export function feedbackDevice(online: boolean): DeviceInfo {
  const screen = Dimensions.get('screen');
  const viewport = Dimensions.get('window');
  return {
    app: APP_VERSION,
    platform: Platform.OS === 'android' ? 'Android' : 'iOS',
    ...nativeDevice(),
    screen: `${Math.round(screen.width)} × ${Math.round(screen.height)}`,
    viewport: `${Math.round(viewport.width)} × ${Math.round(viewport.height)}`,
    pixelRatio: String(Math.round(screen.scale * 100) / 100),
    display: 'Native app',
    online: online ? 'Yes' : 'No',
  };
}

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
