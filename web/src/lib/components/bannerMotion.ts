// The enter/exit motion the two canvas banners share: InstallBanner flies up
// from the bottom dock and SaveFailureBanner down from the top edge, over one
// distance and timing. Kept apart from motionDurations.ts, which startup
// modules import, so these ride in the banners' lazy overlay chunk.
export const BANNER_FLY_PX = 120;
export const BANNER_ENTER_MS = 420;
export const BANNER_EXIT_MS = 300;
