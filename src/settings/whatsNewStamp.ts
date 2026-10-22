import { APP_VERSION } from '../platform/appVersion';

// The shipping What's New section's content stamp is the app version, so its dot returns with
// each release until the section is opened. The settings store reads it at launch; the release
// notes stay in whatsNew.ts, which only Settings imports, so the web export loads them with
// Settings' chunk instead of on the startup path.
export const WHATS_NEW_STAMP = APP_VERSION;
// Every version a build stamps: package.json's natively, and on web deriveWebVersion's
// major.minor.<commits> or its major.minor.0+<sha> fallback (tools/release/lib/buildVersion.ts).
// native-web-app-version.test.mjs runs each of deriveWebVersion's outcomes through it.
const VERSION_STAMP = /^\d+\.\d+\.\d+(?:\+[0-9a-f]+)?$/;

export function isWhatsNewSeen(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && VERSION_STAMP.test(value));
}
