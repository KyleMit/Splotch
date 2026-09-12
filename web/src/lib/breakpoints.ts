// The device-class boundaries, kept in their own module — free of `$app` and
// every other SvelteKit alias — so Playwright specs and Node scripts can import
// the same value the app lays out against instead of re-declaring it.

// The tablet-class floor, shared by every site that classifies a device by size:
// platform's orientation-lock capability check, settings' default orientation
// (`defaultForceLandscapeOrientation`), and SettingsModal's compact-shell media
// query, which derives its max-height from this value. iPad Mini and larger
// tablets have a smallest side around 744px and Android tablet layouts commonly
// start at 600dp; phone-class devices stay below this even in landscape.
//
// The sites measure different things on purpose — screen size in platform,
// viewport size in settings — but they must agree on where the class boundary
// sits, or default orientation, native lock capability and shell selection
// disagree on the same device.
export const TABLET_MIN_SIDE_PX = 600;

export const PHONE_LANDSCAPE_QUERY = `(orientation: landscape) and (max-height: ${TABLET_MIN_SIDE_PX - 0.02}px)`;

export function isPhoneLandscape(width: number, height: number): boolean {
  return width > height && height < TABLET_MIN_SIDE_PX;
}

// Standalone pages lose their frame at phone width; mastheads and beta steps
// tighten while underline pickers split the content width evenly.
// CSS sites restate this value, enforced by phoneStep.test.ts.
export const PHONE_MAX_WIDTH_PX = 540;

// The large-tablet floor, one step above it: a 13-inch iPad measures 1024 CSS
// px on its short side (1032 on the M4), so this is the smallest side that
// admits only the biggest tablets — an 11-inch iPad stays below it in either
// orientation (834). The bespoke dialogs that scale for roomy viewports take
// their second step here; a CSS media query cannot import it, so each one
// restates it and dialogTabletScaling.test.ts holds them to this value.
export const LARGE_TABLET_MIN_SIDE_PX = 1000;

// The action-button step a viewport renders, classified by its *shorter* side so
// a device keeps its step through a rotation.
//
// It lives here rather than in actionButtonLayout.ts — which owns the pixel
// values and re-exports this — because it reads only the boundaries above, and
// this module is deliberately free of `$app` so a Playwright spec can import it.
// actionButtonLayout.ts pulls in the settings and network stores, which a spec
// running under Node cannot resolve.
export type ActionButtonSizeClass = 'phone' | 'tablet' | 'largeTablet';

export function actionButtonSizeClass(shorterViewportSidePx: number): ActionButtonSizeClass {
  if (shorterViewportSidePx >= LARGE_TABLET_MIN_SIDE_PX) return 'largeTablet';
  return shorterViewportSidePx >= TABLET_MIN_SIDE_PX ? 'tablet' : 'phone';
}

// The admin invite ledger's own steps. It is a data table rather than a page,
// so it takes its own boundaries: usage stacks beneath the code before the row
// actions collapse, which is one step earlier than the rest of the app's phone
// width. Three components skin the same row across these steps — the ledger,
// its action cells and the console's add button — so a value that moves in one
// splits the row's first line from its reveal line. CSS cannot import them;
// ledgerBreakpoints.test.ts holds the copies to these values.
export const ADMIN_LEDGER_COMPACT_MAX_WIDTH_PX = 560;
export const ADMIN_LEDGER_STACK_MAX_WIDTH_PX = 800;

// The ledger's landscape arm is deliberately its own device class, narrower
// than PHONE_LANDSCAPE_QUERY's 600px: adopting the app-wide boundary would give
// the compact ledger to 481-to-599px-tall landscape phones, which is a visual
// change to eyeball rather than assume. Naming and guarding the existing values
// is the half that ships without deciding that.
export const ADMIN_LEDGER_LANDSCAPE_MAX_WIDTH_PX = 956;
export const ADMIN_LEDGER_LANDSCAPE_MAX_HEIGHT_PX = 480;

// Phone-landscape pages prioritize their reading content below this height.
// pageHeight.test.ts guards the CSS copies of this boundary.
export const SHORT_PAGE_HEIGHT_PX = 500;
