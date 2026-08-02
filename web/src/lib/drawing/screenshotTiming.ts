// CSS cannot import this module; the screenshot timing contract test guards the animation value.
export const POLAROID_FLIGHT_MS = 1_900;
// Lets animationend own normal cleanup before the fallback removes a delayed frame.
const POLAROID_CLEANUP_BUFFER_MS = 100;
export const POLAROID_CLEANUP_TIMEOUT_MS = POLAROID_FLIGHT_MS + POLAROID_CLEANUP_BUFFER_MS;
// Covers the complete flight under a starved renderer while bounding teardown assertions.
export const POLAROID_OBSERVATION_MS = 3_000;

// Gives MobileSafari time after a completed save to reclaim full-page PNG surfaces.
export const SCREENSHOT_COOLDOWN_MS = 4_000;
