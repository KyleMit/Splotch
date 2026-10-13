// A browser has no settings page for this app, so the Save Failure Banner never offers one on the
// web, as SaveFailureBanner.svelte's openAppSettings returns outside Capacitor. React Native Web's
// Linking stays off the web startup path.
export function openAppSettings() {}
