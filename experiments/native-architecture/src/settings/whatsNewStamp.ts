import { FEEDBACK_APP_VERSION } from '../feedback/feedbackCopy';

// The shipping What's New section's content stamp is the app version, so its dot returns with
// each release until the section is opened. The settings store reads it at launch; the release
// notes stay in whatsNew.ts, which only Settings imports, so the web export loads them with
// Settings' chunk instead of on the startup path.
export const WHATS_NEW_STAMP = FEEDBACK_APP_VERSION;
const VERSION_STAMP = /^\d+\.\d+\.\d+$/;

export function isWhatsNewSeen(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && VERSION_STAMP.test(value));
}

export function whatsNewUnseen(seen: string | null) {
  return seen !== WHATS_NEW_STAMP;
}
