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
