// The TestFlight enrollment facts rendered by /ios-beta. This side-effect-free
// boundary gives the page, native-bundle scan, and tests one source of truth for
// every external URL.

export const TESTFLIGHT_INVITE_CODE = '9GRH3JNQ';

/** The public invitation Apple generated for Splotch's external testing group. */
export const TESTFLIGHT_INVITE_URL = `https://testflight.apple.com/join/${TESTFLIGHT_INVITE_CODE}`;

/** Apple's own TestFlight listing, used before the invitation is opened. */
export const TESTFLIGHT_APP_URL = 'https://apps.apple.com/app/testflight/id899247664';
