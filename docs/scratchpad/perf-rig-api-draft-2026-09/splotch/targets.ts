// The eleven deployment targets, as data. docs/PROFILING-MECHANICS.md restates this table and a
// Splotch-owned test holds the two together.
import { defineTargets, type TargetDefinition } from 'perf-rig';

type SplotchRuntime =
  | 'ios-safari'
  | 'ios-capacitor-webview'
  | 'android-chrome'
  | 'android-capacitor-webview'
  | 'desktop-playwright';

const IPAD_LANDSCAPE = { width: 1366, height: 915, deviceScaleFactor: 2 } as const;

const ipad = <const H extends 'device' | 'simulator', const R extends 'web' | 'native'>(
  host: H,
  runtime: R
): TargetDefinition<SplotchRuntime> & { id: `ipad-${H}-${R}` } => ({
  id: `ipad-${host}-${runtime}`,
  label: `iPad ${host} · ${runtime}`,
  platform: 'ios',
  host,
  runtime,
  deviceClass: 'tablet',
  captureRuntime: runtime === 'web' ? 'ios-safari' : 'ios-capacitor-webview',
  refreshRegime: '60hz',
  transports: {
    drawing: 'appium-xcuitest',
    actions: 'appium-xcuitest',
    measurement: 'appium-execute',
  },
  instruments: ['host-quiet'],
  evidenceRole: host === 'device' ? (runtime === 'web' ? 'gated' : 'advisory') : 'advisory',
  physicalDevice: host === 'device',
});

const android = <const H extends 'device' | 'emulator', const R extends 'web' | 'native'>(
  host: H,
  runtime: R
): TargetDefinition<SplotchRuntime> & { id: `android-${H}-${R}` } => ({
  id: `android-${host}-${runtime}`,
  label: `Android ${host} · ${runtime}`,
  platform: 'android',
  host,
  runtime,
  deviceClass: 'handset',
  captureRuntime: runtime === 'web' ? 'android-chrome' : 'android-capacitor-webview',
  refreshRegime: host === 'device' ? '120hz' : '60hz',
  transports: {
    drawing: 'adb-input',
    actions: runtime === 'web' ? 'cdp-touch' : 'appium-uiautomator2',
    measurement: 'http-upload',
  },
  instruments: ['host-quiet', 'android-refresh-pin'],
  evidenceRole: host === 'device' ? 'advisory' : 'advisory',
  physicalDevice: host === 'device',
  ...(runtime === 'native' ? { webviewClass: 'android.webkit.WebView' } : {}),
});

const mac = <const L extends 'chrome' | 'safari' | 'firefox'>(
  engine: 'chromium' | 'webkit' | 'firefox',
  label: L,
  regime: '60hz' | '120hz'
): TargetDefinition<SplotchRuntime> & { id: `mac-${L}` } => ({
  id: `mac-${label}`,
  label: `Mac · ${label}`,
  platform: 'macos',
  host: 'desktop',
  runtime: 'web',
  deviceClass: 'desktop',
  engine,
  captureRuntime: 'desktop-playwright',
  refreshRegime: regime,
  transports: {
    drawing: 'desktop-playwright',
    actions: 'desktop-playwright',
    measurement: 'same-process',
  },
  instruments: ['host-quiet'],
  evidenceRole: 'tripwire',
  physicalDevice: false,
  viewport: IPAD_LANDSCAPE,
});

export const targets = defineTargets([
  ipad('device', 'web'),
  ipad('device', 'native'),
  ipad('simulator', 'web'),
  ipad('simulator', 'native'),
  android('device', 'web'),
  android('device', 'native'),
  android('emulator', 'web'),
  android('emulator', 'native'),
  mac('chromium', 'chrome', '120hz'),
  mac('webkit', 'safari', '60hz'),
  mac('firefox', 'firefox', '120hz'),
] as const);
