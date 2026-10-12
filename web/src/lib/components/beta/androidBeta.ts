// The closed-testing facts /beta's Android tab renders, in a side-effect-free
// module so the drift guards can read them: androidBeta.test.ts checks
// MIN_ANDROID_API_LEVEL against android/variables.gradle, and
// tools/mobile/check-app-ids.mjs checks PLAY_STORE_APP_ID against
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

/**
 * The group's *about* page, not its message list. Both offer the same "Join
 * group" action to a non-member, but the message list opens on a permission
 * warning first — alarming for a link handed to a parent, and nothing the
 * reader has to act on.
 */
export const TESTERS_GROUP_URL = `https://groups.google.com/g/${TESTERS_GROUP_NAME}/about`;

// The support address moved to $lib/supportEmail once /feedback offered it too.

/** The Android floor the store enforces on install — android/variables.gradle. */
export const MIN_ANDROID_API_LEVEL = 24;

/** The platform release MIN_ANDROID_API_LEVEL shipped as, for humans. */
export const MIN_ANDROID_RELEASE = '7.0';
