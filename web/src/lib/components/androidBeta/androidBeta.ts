// The closed-testing facts the /android-beta page renders, in a side-effect-free
// module so the drift guards can read them: androidBeta.test.ts checks
// MIN_ANDROID_API_LEVEL against android/variables.gradle, and
// scripts/check-native-app-id.mjs checks PLAY_STORE_APP_ID against
// capacitor.config.json.

export const PLAY_STORE_APP_ID = 'art.splotch.app';

/**
 * Google Play's tester opt-in page. This is the link to hand out: it resolves
 * for anyone signed in to a Google account, whether or not they are a tester
 * yet, and is the only page that offers the "Become a tester" action.
 */
export const BETA_OPT_IN_URL = `https://play.google.com/apps/testing/${PLAY_STORE_APP_ID}`;

/**
 * The public store listing. While the app is in closed testing this 404s for
 * anyone who has not already opted in, so it belongs after the opt-in step
 * rather than as the first call to action.
 */
export const PLAY_STORE_LISTING_URL = `https://play.google.com/store/apps/details?id=${PLAY_STORE_APP_ID}`;

// Google Play gates the closed track on membership of this group, so joining it
// is step one.
const TESTERS_GROUP_NAME = 'splotch-testers';

export const TESTERS_GROUP_URL = `https://groups.google.com/g/${TESTERS_GROUP_NAME}`;

export const FEEDBACK_ISSUE_URL = 'https://github.com/KyleMit/Splotch/issues/new/choose';

// The support address is split so the literal string appears nowhere in the
// prerendered HTML: the page composes it after hydration, which keeps it out of
// reach of the harvesters that scrape static markup. A headless scraper can
// still reassemble it — this reduces exposure, it doesn't eliminate it.
const SUPPORT_MAILBOX = 'kylemit.dev';
const SUPPORT_DOMAIN = 'gmail.com';

/** Call from the browser only — see the note above on SUPPORT_MAILBOX. */
export function supportEmail(): string {
  return `${SUPPORT_MAILBOX}@${SUPPORT_DOMAIN}`;
}

/** The Android floor the store enforces on install — android/variables.gradle. */
export const MIN_ANDROID_API_LEVEL = 24;

/** The platform release MIN_ANDROID_API_LEVEL shipped as, for humans. */
export const MIN_ANDROID_RELEASE = '7.0';
