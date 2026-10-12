// The TestFlight enrollment facts rendered by /beta's iOS tab. This side-effect-free
// boundary gives the page, native-bundle scan, and tests one source of truth for
// every external URL.

export const TESTFLIGHT_INVITE_CODE = '9GRH3JNQ';

/** The minimum iOS and iPadOS release accepted by the native target. */
export const MIN_IOS_RELEASE = '16.4';

/** The public invitation Apple generated for Splotch's external testing group. */
export const TESTFLIGHT_INVITE_URL = `https://testflight.apple.com/join/${TESTFLIGHT_INVITE_CODE}`;

/** Apple's own TestFlight listing, used before the invitation is opened. */
export const TESTFLIGHT_APP_URL = 'https://apps.apple.com/app/testflight/id899247664';
