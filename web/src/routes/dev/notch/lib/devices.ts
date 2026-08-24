import { NO_CUTOUT, type Cutout, type DeviceProfile } from './deviceProfile';

// The safe-area profiles worth rendering, one per distinct inset tuple rather
// than one per model — a second phone reporting the same four numbers at the
// same viewport exercises nothing the first didn't. Sources and confidence ride
// on each entry; see docs/SAFE-AREA.md for the research they came from and for
// the values that are inferred rather than measured.
//
// Cutout geometry is ILLUSTRATION ONLY. The insets are researched; the pill and
// hole-punch dimensions are eyeballed from device photos so the overlay puts the
// camera roughly where it really is. Nothing computes from them — they exist so
// that a landscape tile shows which side the notch is physically on, which is
// exactly what the insets themselves cannot tell you on iOS.

function notch(widthPx: number): Cutout {
  return { kind: 'notch', centerX: 0.5, widthPx, heightPx: 30, topPx: 0 };
}

function dynamicIsland(topPx: number): Cutout {
  return { kind: 'dynamic-island', centerX: 0.5, widthPx: 126, heightPx: 37, topPx };
}

function holePunch(centerX: number, statusBarPx: number): Cutout {
  // Centred on the status bar's vertical midpoint, which is how OEMs size it.
  const diameter = 24;
  return {
    kind: 'hole-punch',
    centerX,
    widthPx: diameter,
    heightPx: diameter,
    topPx: Math.max(6, Math.round(statusBarPx / 2 - diameter / 2)),
  };
}

// iOS insets both landscape sides with the same value whichever side the cutout
// is on, so the two landscape rotations differ only in the illustration.
function symmetricLandscape(side: number, top: number, bottom: number) {
  return { top, right: side, bottom, left: side };
}

const IOS_SOURCES = [
  'https://useyourloaf.com/blog/iphone-17-screen-sizes/',
  'https://useyourloaf.com/blog/supporting-iphone-x/',
  'https://webkit.org/blog/7929/designing-websites-for-iphone-x/',
];

const IPAD_SOURCES = [
  'https://github.com/bouchenoiremarc/ios-dimensions',
  'https://useyourloaf.com/blog/ipad-2024-screen-sizes/',
  'https://useyourloaf.com/blog/ipad-2021-screen-sizes/',
];

export const DEVICE_PROFILES: DeviceProfile[] = [
  {
    id: 'iphone-home-button',
    label: 'iPhone · home button',
    models: ['iPhone SE (2nd/3rd gen)', 'iPhone 8', 'iPhone 7'],
    platform: 'ios',
    surface: 'native',
    viewport: { width: 375, height: 667 },
    cornerRadiusPx: 0,
    cutout: NO_CUTOUT,
    insets: {
      portrait: { top: 20, right: 0, bottom: 0, left: 0 },
      // iOS hides the status bar on iPhone in landscape, so every inset is zero.
      'landscape-left': { top: 0, right: 0, bottom: 0, left: 0 },
      'landscape-right': { top: 0, right: 0, bottom: 0, left: 0 },
      'portrait-upside-down': { top: 20, right: 0, bottom: 0, left: 0 },
    },
    confidence: 'high',
    notes:
      'The only iPhone class that rotates to upside-down portrait, and the only one whose landscape insets are all zero. A 20px top is a status bar, not a cutout — nothing to paint a band on.',
    sources: IOS_SOURCES,
  },
  {
    id: 'iphone-notch-44',
    label: 'iPhone · notch 44',
    models: ['iPhone X', 'iPhone XS', 'iPhone 11 Pro', 'iPhone XS Max', 'iPhone 11 Pro Max'],
    platform: 'ios',
    surface: 'native',
    viewport: { width: 375, height: 812 },
    cornerRadiusPx: 44,
    cutout: notch(209),
    insets: {
      portrait: { top: 44, right: 0, bottom: 34, left: 0 },
      'landscape-left': symmetricLandscape(44, 0, 21),
      'landscape-right': symmetricLandscape(44, 0, 21),
    },
    confidence: 'high',
    notes: 'The original notch. 44 is also the smallest top inset any cutout iPhone reports.',
    sources: IOS_SOURCES,
  },
  {
    id: 'iphone-notch-48',
    label: 'iPhone · notch 48',
    models: ['iPhone XR', 'iPhone 11'],
    platform: 'ios',
    surface: 'native',
    viewport: { width: 414, height: 896 },
    cornerRadiusPx: 41,
    cutout: notch(230),
    insets: {
      portrait: { top: 48, right: 0, bottom: 34, left: 0 },
      'landscape-left': symmetricLandscape(48, 0, 21),
      'landscape-right': symmetricLandscape(48, 0, 21),
    },
    confidence: 'medium',
    notes:
      'Same 414x896 viewport as the XS Max, different top inset (48 vs 44) — proof that viewport size never implies the inset. Landscape values are pattern-inferred, not directly cited.',
    sources: ['https://1440px.com/screen-sizes/iphone-11/'],
  },
  {
    id: 'iphone-notch-50',
    label: 'iPhone · notch 50 (mini)',
    models: ['iPhone 12 mini', 'iPhone 13 mini'],
    platform: 'ios',
    surface: 'native',
    viewport: { width: 375, height: 812 },
    cornerRadiusPx: 44,
    cutout: notch(160),
    insets: {
      portrait: { top: 50, right: 0, bottom: 34, left: 0 },
      'landscape-left': symmetricLandscape(50, 0, 21),
      'landscape-right': symmetricLandscape(50, 0, 21),
    },
    confidence: 'high',
    notes:
      'Smallest modern viewport paired with the second-deepest notch inset — the worst ratio of chrome to canvas in the lineup, and the tile most likely to show the HUD running out of room. Shares 375x812 with the iPhone X at a different inset.',
    sources: ['https://useyourloaf.com/blog/iphone-12-screen-sizes/'],
  },
  {
    id: 'iphone-notch-47',
    label: 'iPhone · notch 47',
    models: ['iPhone 12', 'iPhone 13', 'iPhone 14', 'iPhone 16e'],
    platform: 'ios',
    surface: 'native',
    viewport: { width: 390, height: 844 },
    cornerRadiusPx: 47,
    cutout: notch(157),
    insets: {
      portrait: { top: 47, right: 0, bottom: 34, left: 0 },
      'landscape-left': symmetricLandscape(47, 0, 21),
      'landscape-right': symmetricLandscape(47, 0, 21),
    },
    confidence: 'high',
    notes: 'The largest installed base of any single class.',
    sources: ['https://useyourloaf.com/blog/iphone-14-screen-sizes/'],
  },
  {
    id: 'iphone-island-59',
    label: 'iPhone · Dynamic Island 59',
    models: ['iPhone 14 Pro', 'iPhone 15', 'iPhone 15 Pro', 'iPhone 16'],
    platform: 'ios',
    surface: 'native',
    viewport: { width: 393, height: 852 },
    cornerRadiusPx: 55,
    cutout: dynamicIsland(11),
    insets: {
      portrait: { top: 59, right: 0, bottom: 34, left: 0 },
      'landscape-left': symmetricLandscape(59, 0, 21),
      'landscape-right': symmetricLandscape(59, 0, 21),
    },
    confidence: 'high',
    notes:
      'The island floats below the screen edge, so the band paints a strip taller than the cutout with clear glass above and below it.',
    sources: ['https://useyourloaf.com/blog/iphone-16-screen-sizes/'],
  },
  {
    id: 'iphone-island-62',
    label: 'iPhone · Dynamic Island 62',
    models: ['iPhone 16 Pro', 'iPhone 17', 'iPhone 17 Pro'],
    platform: 'ios',
    surface: 'native',
    viewport: { width: 402, height: 874 },
    cornerRadiusPx: 62,
    cutout: dynamicIsland(14),
    insets: {
      portrait: { top: 62, right: 0, bottom: 34, left: 0 },
      'landscape-left': symmetricLandscape(62, 0, 21),
      'landscape-right': symmetricLandscape(62, 0, 21),
    },
    confidence: 'high',
    notes:
      'On iOS 26 the landscape insets are reported as top 20 / bottom 20 rather than 0 / 21. Confirmed for UIKit; unverified for WebKit env(), so the iOS 18 values are what this tile renders.',
    sources: ['https://useyourloaf.com/blog/iphone-17-screen-sizes/'],
  },
  {
    id: 'iphone-air-68',
    label: 'iPhone Air · 68',
    models: ['iPhone Air'],
    platform: 'ios',
    surface: 'native',
    viewport: { width: 420, height: 912 },
    cornerRadiusPx: 62,
    cutout: dynamicIsland(16),
    insets: {
      portrait: { top: 68, right: 0, bottom: 34, left: 0 },
      'landscape-left': symmetricLandscape(68, 20, 29),
      'landscape-right': symmetricLandscape(68, 20, 29),
    },
    confidence: 'medium',
    notes:
      'The deepest inset shipping, and the only class with a non-zero landscape top AND a 29px landscape bottom. Single source; treat the numbers as indicative.',
    sources: ['https://useyourloaf.com/blog/iphone-17-screen-sizes/'],
  },
  {
    id: 'ipad-home-button',
    label: 'iPad · home button',
    models: ['iPad (9th gen)', 'iPad Air 3', 'iPad mini 5'],
    platform: 'ios',
    surface: 'native',
    viewport: { width: 810, height: 1080 },
    cornerRadiusPx: 0,
    cutout: NO_CUTOUT,
    insets: {
      portrait: { top: 20, right: 0, bottom: 0, left: 0 },
      // iPad, unlike iPhone, keeps its status bar in landscape.
      'landscape-left': { top: 20, right: 0, bottom: 0, left: 0 },
      'landscape-right': { top: 20, right: 0, bottom: 0, left: 0 },
      'portrait-upside-down': { top: 20, right: 0, bottom: 0, left: 0 },
    },
    confidence: 'high',
    notes: 'Still the most common iPad in schools. No cutout, no home indicator.',
    sources: IPAD_SOURCES,
  },
  {
    id: 'ipad-home-indicator',
    label: 'iPad · home indicator',
    models: ['iPad (10th/11th gen)', 'iPad Air 11"', 'iPad Pro 11"', 'iPad mini 6/7'],
    platform: 'ios',
    surface: 'native',
    viewport: { width: 820, height: 1180 },
    cornerRadiusPx: 25,
    cutout: NO_CUTOUT,
    insets: {
      portrait: { top: 24, right: 0, bottom: 20, left: 0 },
      'landscape-left': { top: 24, right: 0, bottom: 20, left: 0 },
      'landscape-right': { top: 24, right: 0, bottom: 20, left: 0 },
      'portrait-upside-down': { top: 24, right: 0, bottom: 20, left: 0 },
    },
    confidence: 'high',
    notes:
      'A bottom inset with no cutout anywhere, identical in all four orientations. 24 is the hard ceiling for a top inset on any iPad ever shipped — no iPad has a display cutout — which is what leaves the 30px notch threshold its headroom. Note the 25px corner radius still produces left/right insets of ZERO: rounded corners do not inset the sides on iPad.',
    sources: IPAD_SOURCES,
  },
  {
    id: 'ipad-mini',
    label: 'iPad mini',
    models: ['iPad mini 6', 'iPad mini 7 (A17 Pro)'],
    platform: 'ios',
    surface: 'native',
    viewport: { width: 744, height: 1133 },
    cornerRadiusPx: 21,
    cutout: NO_CUTOUT,
    insets: {
      portrait: { top: 24, right: 0, bottom: 20, left: 0 },
      'landscape-left': { top: 24, right: 0, bottom: 20, left: 0 },
      'landscape-right': { top: 24, right: 0, bottom: 20, left: 0 },
      'portrait-upside-down': { top: 24, right: 0, bottom: 20, left: 0 },
    },
    confidence: 'high',
    notes:
      'Same inset tuple as the 11-inch iPads at the narrowest tablet viewport shipping — 744 is the closest any tablet gets to the 600px phone boundary, so it is where a tablet layout is most likely to run out of room. iPadOS still reports a regular size class here; it does not behave like a large phone.',
    sources: IPAD_SOURCES,
  },
  {
    id: 'ipad-13-inch',
    label: 'iPad Pro 13-inch',
    models: ['iPad Pro 13" (M4/M5)', 'iPad Pro 12.9" (3rd–6th gen)', 'iPad Air 13"'],
    platform: 'ios',
    surface: 'native',
    viewport: { width: 1032, height: 1376 },
    cornerRadiusPx: 18,
    cutout: NO_CUTOUT,
    insets: {
      portrait: { top: 24, right: 0, bottom: 20, left: 0 },
      'landscape-left': { top: 24, right: 0, bottom: 20, left: 0 },
      'landscape-right': { top: 24, right: 0, bottom: 20, left: 0 },
      'portrait-upside-down': { top: 24, right: 0, bottom: 20, left: 0 },
    },
    confidence: 'medium',
    notes:
      'The only profile whose shorter side clears LARGE_TABLET_MIN_SIDE_PX, so it is the only one that renders the largeTablet action-button step (68/62 rather than 60/55). Its inset tuple is identical to every other home-indicator iPad, which is exactly why an inset-only dataset would drop it and never exercise that branch.',
    sources: IPAD_SOURCES,
  },
  {
    id: 'ipad-safari-tab',
    label: 'iPad · Safari tab',
    models: ['Any home-indicator iPad, in a browser tab rather than installed'],
    platform: 'ios',
    surface: 'browser',
    viewport: { width: 820, height: 1180 },
    cornerRadiusPx: 25,
    cutout: NO_CUTOUT,
    insets: {
      portrait: { top: 0, right: 0, bottom: 20, left: 0 },
      'landscape-left': { top: 0, right: 0, bottom: 20, left: 0 },
      'landscape-right': { top: 0, right: 0, bottom: 20, left: 0 },
      'portrait-upside-down': { top: 0, right: 0, bottom: 20, left: 0 },
    },
    confidence: 'medium',
    notes:
      'The pure bottom-inset case, and the one most people actually hit: Safari’s own chrome absorbs the top inset, and iPadOS Safari has no bottom toolbar, so the 20px home-indicator inset passes straight through to the page. A bottom inset arrives with nothing above it to justify a band.',
    sources: IPAD_SOURCES,
  },
  {
    id: 'android-chrome-tab',
    label: 'Android · Chrome tab',
    models: ['Any Android phone, in a browser tab or an installed PWA'],
    platform: 'android',
    surface: 'browser',
    viewport: { width: 412, height: 915 },
    cornerRadiusPx: 24,
    cutout: holePunch(0.5, 50),
    insets: {
      portrait: { top: 0, right: 0, bottom: 24, left: 0 },
      'landscape-left': { top: 0, right: 0, bottom: 24, left: 0 },
      'landscape-right': { top: 0, right: 0, bottom: 24, left: 0 },
    },
    confidence: 'high',
    notes:
      'The top inset is ALWAYS zero on Android web, cutout or not — Chrome\u2019s own toolbar occupies that band, and an installed PWA still does not draw behind the status bar either. The band can never paint here; <meta name="theme-color"> is the only mechanism that tints an Android web status bar. The bottom inset is the gesture chin and is DYNAMIC — it retracts as you scroll, so safe-area-max-inset-bottom is the stable number.',
    sources: ['https://developer.chrome.com/docs/css-ui/edge-to-edge'],
  },
  {
    id: 'android-native-no-cutout',
    label: 'Android native · no cutout',
    models: ['Pixel 3', 'Galaxy S9', 'OnePlus 7 Pro (pop-up camera)'],
    platform: 'android',
    surface: 'native',
    viewport: { width: 412, height: 824 },
    cornerRadiusPx: 20,
    cutout: NO_CUTOUT,
    insets: {
      portrait: { top: 24, right: 0, bottom: 24, left: 0 },
      // Android, unlike iPhone, keeps the status bar on the top edge in landscape.
      'landscape-left': { top: 24, right: 0, bottom: 24, left: 0 },
      'landscape-right': { top: 24, right: 0, bottom: 24, left: 0 },
    },
    confidence: 'high',
    notes:
      'The AOSP baseline: a 24dp status bar and a 24dp gesture chin, with the status bar staying on the top edge through rotation.',
    sources: [
      'https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/res/res/values/dimens.xml',
    ],
  },
  {
    id: 'android-native-punch-gesture',
    label: 'Android native · hole punch, gesture nav',
    models: ['Pixel 6', 'Pixel 7', 'Pixel 8'],
    platform: 'android',
    surface: 'native',
    viewport: { width: 412, height: 915 },
    cornerRadiusPx: 30,
    cutout: holePunch(0.5, 50),
    insets: {
      portrait: { top: 50, right: 0, bottom: 24, left: 0 },
      // The cutout inset follows the physical rotation on Android — the one
      // place it does, and the opposite of iOS's symmetric pair.
      'landscape-left': { top: 28, right: 0, bottom: 24, left: 38 },
      'landscape-right': { top: 28, right: 38, bottom: 24, left: 0 },
    },
    confidence: 'medium',
    notes:
      'Android rotates the cutout inset onto the side it is physically on, so the two landscape tiles differ here where the iPhone ones cannot. Note the landscape top inset does not vanish: most OEMs declare a separate, shorter landscape status bar rather than dropping to zero. Derived from LineageOS device overlays and the declared cutout path, not measured on hardware.',
    sources: ['https://android.googlesource.com/platform/frameworks/base/'],
  },
  {
    id: 'android-native-punch-3button',
    label: 'Android native · hole punch, 3-button nav',
    models: ['Any hole-punch Android phone with 3-button navigation enabled'],
    platform: 'android',
    surface: 'native',
    viewport: { width: 412, height: 915 },
    cornerRadiusPx: 30,
    cutout: holePunch(0.5, 50),
    insets: {
      portrait: { top: 50, right: 0, bottom: 48, left: 0 },
      // The hard case: 3-button nav moves to a side in landscape (right at 90°,
      // left at 270°) — always the side the cutout is NOT on. Both sides carry
      // an inset, from two unrelated causes, and the deeper one is the nav bar.
      'landscape-left': { top: 28, right: 48, bottom: 0, left: 38 },
      'landscape-right': { top: 28, right: 38, bottom: 0, left: 48 },
    },
    confidence: 'high',
    notes:
      'The scenario that breaks any "deepest side inset is the cutout" rule, and the reason the band cannot simply paint both sides. With 3-button navigation the nav bar leaves the bottom edge in landscape and takes a side — the opposite side from the camera — so left and right are both non-zero and the DEEPER one is the nav bar. Following the deeper inset would paint the drawing colour behind the back/home/recents buttons and leave the camera strip bare; painting both would paint over the buttons too. Here the rotation angle decides, which it can because the two sides are distinguishable.',
    sources: [
      'https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/packages/SystemUI/src/com/android/systemui/navigationbar/views/NavigationBar.java',
    ],
  },
  {
    id: 'android-native-tall-status-bar',
    label: 'Android native · tall status bar',
    models: ['Pixel 9', 'Pixel 9 Pro', 'Pixel 9 Pro XL', 'Pixel 9 Pro Fold (cover)'],
    platform: 'android',
    surface: 'native',
    viewport: { width: 412, height: 923 },
    cornerRadiusPx: 30,
    cutout: holePunch(0.5, 66),
    insets: {
      portrait: { top: 66, right: 0, bottom: 24, left: 0 },
      'landscape-left': { top: 28, right: 0, bottom: 24, left: 46 },
      'landscape-right': { top: 28, right: 46, bottom: 24, left: 0 },
    },
    confidence: 'high',
    notes:
      'The deepest top inset on any mainstream Android phone — Android 15 QPR1 grew the status bar to clear the Pixel 9 camera. Declared in dp in the device overlay, so no density inference.',
    sources: ['https://github.com/LineageOS/android_device_google_caimito'],
  },
  {
    id: 'android-samsung-punch',
    label: 'Android native · Samsung One UI punch',
    models: ['Galaxy S21 – S25 and Plus/Ultra'],
    platform: 'android',
    surface: 'native',
    viewport: { width: 411, height: 882 },
    cornerRadiusPx: 26,
    cutout: holePunch(0.5, 29),
    insets: {
      portrait: { top: 28.6, right: 0, bottom: 24, left: 0 },
      'landscape-left': { top: 24, right: 0, bottom: 24, left: 26 },
      'landscape-right': { top: 24, right: 26, bottom: 24, left: 0 },
    },
    confidence: 'medium',
    notes:
      'One UI status bars are far shorter than Pixel’s — 28.6 against 50–66 — which lands this class within a couple of px of an iPad’s 24 and right at the edge of the 30px notch threshold. A real hole punch that the app will decline to paint. Curved glass contributes nothing: waterfall insets are zero on every shipped device. The bottom inset can also be 0, because One UI lets the user turn the gesture hint bar off entirely.',
    sources: ['https://github.com/AppAndFlow/react-native-safe-area-context/issues/466'],
  },
  {
    id: 'android-tablet',
    label: 'Android tablet',
    models: ['Pixel Tablet', 'Galaxy Tab S9', 'unfolded foldables'],
    platform: 'android',
    surface: 'native',
    viewport: { width: 800, height: 1280 },
    cornerRadiusPx: 20,
    cutout: NO_CUTOUT,
    insets: {
      portrait: { top: 24, right: 0, bottom: 24, left: 0 },
      'landscape-left': { top: 24, right: 0, bottom: 24, left: 0 },
      'landscape-right': { top: 24, right: 0, bottom: 24, left: 0 },
      'portrait-upside-down': { top: 24, right: 0, bottom: 24, left: 0 },
    },
    confidence: 'medium',
    notes:
      'The only Android class that rotates to upside-down portrait: config_allowAllRotations is true from sw600dp up, and false on every phone. Its 3-button nav bar also stays on the bottom in landscape rather than moving to a side.',
    sources: [
      'https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/res/res/values-sw600dp/config.xml',
    ],
  },
];

export const DEVICE_IDS = DEVICE_PROFILES.map((profile) => profile.id);
