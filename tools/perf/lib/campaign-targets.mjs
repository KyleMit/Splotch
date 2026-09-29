export const SPLIT_TRANSPORT = 'split';

// `captureRuntime` names the input-fidelity expectations for each target.
// `refreshRegime` names its measured presentation rate; null keeps a new
// target unscoreable until a capture establishes that rate.
export const CAMPAIGN_TARGETS = {
  'ipad-simulator-web': {
    captureRuntime: 'ios-safari',
    // Measured at 17 ms across the issue-1215 simulator-web corpus; the
    // refresh-regime test binds this declaration to those raw captures.
    refreshRegime: '60hz',
    label: 'iPad Simulator · web',
    transport: 'appium',
    runtime: 'web',
    deviceClass: 'tablet',
  },
  'ipad-simulator-native': {
    captureRuntime: 'ios-capacitor-webview',
    // Measured at 17 ms in the installed simulator WebView across the
    // issue-1215 corpus, independently of the simulator's Safari row.
    refreshRegime: '60hz',
    label: 'iPad Simulator · native',
    transport: 'appium',
    runtime: 'native',
    deviceClass: 'tablet',
  },
  'ipad-device-web': {
    captureRuntime: 'ios-safari',
    refreshRegime: '60hz',
    label: 'iPad device · web',
    transport: 'appium',
    runtime: 'web',
    deviceClass: 'tablet',
    physicalDevice: true,
  },
  'ipad-device-native': {
    captureRuntime: 'ios-capacitor-webview',
    refreshRegime: '60hz',
    label: 'iPad device · native',
    transport: 'appium',
    runtime: 'native',
    deviceClass: 'tablet',
    physicalDevice: true,
  },
  'iphone-device-web': {
    captureRuntime: 'ios-safari',
    refreshRegime: null,
    label: 'iPhone device · web',
    transport: 'appium',
    runtime: 'web',
    deviceClass: 'handset',
    physicalDevice: true,
  },
  'iphone-device-native': {
    captureRuntime: 'ios-capacitor-webview',
    refreshRegime: null,
    label: 'iPhone device · native',
    transport: 'appium',
    runtime: 'native',
    deviceClass: 'handset',
    physicalDevice: true,
  },
  'android-emulator-web': {
    captureRuntime: 'android-chrome',
    // Measured from the 2026-08-26-emulator-regime-bootstrap capture: 16.7 ms
    // beat across 3510 in-contact frames, the emulator's display emulated at a
    // fixed 60 Hz. Declared via the bank-then-declare bootstrap the moment the
    // ADR-0145 density floor made an emulator capture fidelity-passing at all;
    // refresh-regime.test.mjs pins the corpus.
    refreshRegime: '60hz',
    deviceClass: 'handset',
    // Drawing through the ADR-0135 split transport, exactly as the physical
    // phone: the Appium browser path measures 0.82 moves/frame here with
    // per-run main-thread-stall distortion no stream statistic separates from
    // real starvation (2026-08-26-appium-60hz-controls), while adb split input
    // measures 1.09 and banked the regime evidence. Actions stay on direct CDP
    // (ADR-0092).
    label: 'Android emulator · web',
    transport: SPLIT_TRANSPORT,
    splitPlatform: 'android',
    runtime: 'web',
    actionsTransport: 'cdp',
    webviewClass: 'android.webkit.WebView',
  },
  'android-emulator-native': {
    captureRuntime: 'android-capacitor-webview',
    // Measured at 16.7 ms across all four modes in the issue-1215 native
    // emulator corpus; declared from those captures, not from the web sibling.
    refreshRegime: '60hz',
    deviceClass: 'handset',
    label: 'Android emulator · native',
    // ADR-0145: Appium drives this 60 Hz WebView at 0.82 moves/frame, below
    // the 0.9 fidelity floor, and perturbs the main thread while doing so.
    // Drawing therefore uses the split transport; Appium remains valid for
    // the discrete action sweep.
    transport: SPLIT_TRANSPORT,
    splitPlatform: 'android',
    runtime: 'native',
    webviewClass: 'android.webkit.WebView',
  },
  'android-device-web': {
    captureRuntime: 'android-chrome',
    refreshRegime: '120hz',
    deviceClass: 'handset',
    label: 'Android device · web',
    // ADR-0135: the Appium browser transport drives this device at 46.8 contact
    // moves/s against a 100-170 band, so every cell it produces fails fidelity and
    // cannot be scored. The split transport measures 116.6 on the same hardware.
    transport: SPLIT_TRANSPORT,
    splitPlatform: 'android',
    runtime: 'web',
    actionsTransport: 'cdp',
    webviewClass: 'android.webkit.WebView',
    physicalDevice: true,
  },
  'mac-chrome': {
    captureRuntime: 'desktop-playwright',
    refreshRegime: '120hz',
    label: 'Mac · Chrome',
    transport: 'desktop',
    desktopEngine: 'chromium',
    actionsTransport: 'desktop',
    runtime: 'web',
    deviceClass: 'desktop',
  },
  'mac-safari': {
    captureRuntime: 'desktop-playwright',
    refreshRegime: '60hz',
    label: 'Mac · Safari',
    transport: 'desktop',
    desktopEngine: 'webkit',
    actionsTransport: 'desktop',
    runtime: 'web',
    deviceClass: 'desktop',
  },
  'mac-firefox': {
    captureRuntime: 'desktop-playwright',
    refreshRegime: '120hz',
    label: 'Mac · Firefox',
    transport: 'desktop',
    desktopEngine: 'firefox',
    actionsTransport: 'desktop',
    runtime: 'web',
    deviceClass: 'desktop',
  },
  'android-device-native': {
    captureRuntime: 'android-capacitor-webview',
    // Measured from the 2026-08-24-hand-native real-finger captures: both report an
    // 8.3 ms beat in the installed Capacitor WebView on the SM-G990U1 — the same
    // panel android-device-web is established at. Declared from those captures, not
    // inferred from the sibling; refresh-regime.test.mjs pins the corpus.
    refreshRegime: '120hz',
    deviceClass: 'handset',
    label: 'Android device · native',
    // ADR-0135 applied to the native runtime (issue 1274): the Appium transport
    // under-drives this device (47.81 contact moves/s, issue 1217), so every
    // drawing cell it produced was unscoreable and the published 0.03% was not
    // a measurement. Drawing rides the split transport into the installed
    // Capacitor WebView via server.url (the PR-1287 path); actions stay on
    // Appium, which drives discrete taps fine.
    transport: SPLIT_TRANSPORT,
    splitPlatform: 'android',
    runtime: 'native',
    webviewClass: 'android.webkit.WebView',
    physicalDevice: true,
  },
};
