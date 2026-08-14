// The two enrollment tracks /beta carries, and how a visitor lands on one.
// Side-effect-free, and deliberately importing nothing: the deprecated solo
// routes, the drift guards, and the E2E specs (which run outside Vite, so a
// `$app` import anywhere in the graph would fail to resolve) all read this one
// vocabulary rather than restating the query key or the tab names. The device
// sniff it takes as an argument is the page's to supply. The tab icons are the
// page's too, for the same reason — naming one costs a `$lib` type import.

/** A store track /beta explains. Native platforms only — the web app needs no beta. */
export type BetaPlatform = 'android' | 'ios';

/** Tab order, and the order the panels are stacked in without JavaScript. */
export const BETA_PLATFORMS = ['android', 'ios'] as const satisfies readonly BetaPlatform[];

/**
 * The query parameter that deep-links a tab, e.g. `/beta?os=ios`. The page is
 * prerendered, so the parameter changes nothing server-side — it is read after
 * hydration, and is what the deprecated `/android-beta` and `/ios-beta`
 * redirects carry so an old link still opens the instructions it promised.
 */
export const BETA_PLATFORM_PARAM = 'os';

/**
 * The tab a visitor lands on when neither the link nor the device names one — a
 * desktop browser, where nobody can install either beta anyway. Android, because
 * its closed test is the one that needs a continuous 14-day tester streak to
 * graduate.
 */
export const DEFAULT_BETA_PLATFORM: BetaPlatform = 'android';

/**
 * Tab labels — also each option's accessible name. Short on purpose: the tabs
 * split a phone screen between them, and `iPhone & iPad` in half of 375px wraps
 * to two lines. Each panel's own heading says which devices it covers.
 */
export const BETA_PLATFORM_LABELS: Record<BetaPlatform, string> = {
  android: 'Android',
  ios: 'iOS',
};

/**
 * Where the resolved platform is stamped on `<html>`. The page's CSS keys the
 * panels off it, so the tab that paints is decided before hydration; while it is
 * absent — no JavaScript, or the stamp threw — no rule matches and both sets of
 * instructions stay visible.
 */
export const BETA_PLATFORM_ATTRIBUTE = 'data-beta-os';

/**
 * The stamp itself, run from /beta's `<head>` before first paint. It exists
 * because the document is prerendered with neither tab chosen: without it the
 * page would paint both panels (or a guessed one) and then rearrange itself the
 * moment hydration resolved `?os=` and the device — a flash on exactly the
 * phones this page is read on.
 *
 * The query key, the attribute, and the fallback are interpolated so they cannot
 * drift from the vocabulary above. The device sniff is the one duplication —
 * inline boot code can import nothing, so it restates the tests
 * `$lib/platform`'s isIosDevice/isAndroidBrowser make (iPadOS 13+ reports itself
 * as a touch-capable "Mac", which is why the MacIntel clause is not optional).
 * betaPlatform.test.ts reads both sides and fails when they diverge.
 */
export const BETA_PLATFORM_BOOT_SCRIPT =
  `(function(){try{` +
  `var os=new URLSearchParams(location.search).get('${BETA_PLATFORM_PARAM}');` +
  `if(${BETA_PLATFORMS.map((platform) => `os!=='${platform}'`).join('&&')}){` +
  `var ua=navigator.userAgent||'';` +
  `os=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)` +
  `?'ios':/android/i.test(ua)?'android':'${DEFAULT_BETA_PLATFORM}';}` +
  `document.documentElement.setAttribute('${BETA_PLATFORM_ATTRIBUTE}',os);` +
  `}catch(e){}})();`;

export function isBetaPlatform(value: string | null): value is BetaPlatform {
  return BETA_PLATFORMS.includes(value as BetaPlatform);
}

/** The canonical link to one platform's instructions. */
export function betaPathFor(platform: BetaPlatform): string {
  return `/beta?${BETA_PLATFORM_PARAM}=${platform}`;
}

/**
 * Which tab opens: an explicit `?os=` wins, because a link handed to a tester
 * names the instructions they were promised even when they open it on the other
 * platform; otherwise the device decides. `detected` is null on a desktop
 * browser — nobody installs either beta from there, so nothing about the user
 * agent beats the prerendered default.
 */
export function resolveBetaPlatform(
  param: string | null,
  detected: BetaPlatform | null
): BetaPlatform {
  if (isBetaPlatform(param)) return param;
  return detected ?? DEFAULT_BETA_PLATFORM;
}
