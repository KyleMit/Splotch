// The eleven deployment targets, as data. docs/PROFILING-MECHANICS.md restates this table and a
// Splotch-owned test holds the two together through the package's resolveTransports.
import { DEFAULT_REFRESH_REGIMES, defineTargets, type TargetDefinition } from 'perf-rig';

export type SplotchRuntime =
  | 'ios-safari'
  | 'ios-capacitor-webview'
  | 'android-chrome'
  | 'android-capacitor-webview'
  | 'desktop-playwright';
export type SplotchRegime = '60hz' | '120hz';

type Target<Id extends string> = TargetDefinition<SplotchRuntime, SplotchRegime> & {
  readonly id: Id;
};

const ipad = <const H extends 'device' | 'simulator', const S extends 'browser' | 'packaged'>(
  host: H,
  shell: S
): Target<`ipad-${H}-${S}`> => ({
  id: `ipad-${host}-${shell}`,
  label: `iPad ${host} · ${shell === 'browser' ? 'web' : 'native'}`,
  platform: 'ios',
  host,
  shell,
  deviceClass: 'tablet',
  captureRuntime: shell === 'browser' ? 'ios-safari' : 'ios-capacitor-webview',
  refreshRegime: '60hz',
  transports: { drawing: 'appium', actions: 'appium', measurement: 'appium-execute' },
  instruments: ['host-quiet'],
  evidenceRole: host === 'device' && shell === 'browser' ? 'gated' : 'advisory',
  physicalDevice: host === 'device',
});

const android = <const H extends 'device' | 'emulator', const S extends 'browser' | 'packaged'>(
  host: H,
  shell: S
): Target<`android-${H}-${S}`> => ({
  id: `android-${host}-${shell}`,
  label: `Android ${host} · ${shell === 'browser' ? 'web' : 'native'}`,
  platform: 'android',
  host,
  shell,
  deviceClass: 'handset',
  captureRuntime: shell === 'browser' ? 'android-chrome' : 'android-capacitor-webview',
  refreshRegime: host === 'device' ? '120hz' : '60hz',
  transports: {
    drawing: 'adb-input',
    actions: shell === 'browser' ? 'cdp-touch' : 'appium',
    measurement: 'http-upload',
  },
  instruments: ['host-quiet', 'android-refresh-pin'],
  evidenceRole: 'advisory',
  physicalDevice: host === 'device',
});

const mac = <const L extends 'chrome' | 'safari' | 'firefox'>(
  engine: 'chromium' | 'webkit' | 'firefox',
  label: L,
  regime: SplotchRegime
): Target<`mac-${L}`> => ({
  id: `mac-${label}`,
  label: `Mac · ${label}`,
  platform: 'macos',
  host: 'desktop',
  shell: 'browser',
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
  evidenceRole: 'advisory',
  physicalDevice: false,
  viewport: { width: 1366, height: 915, deviceScaleFactor: 2 },
});

export const targets = defineTargets(
  [
    ipad('device', 'browser'),
    ipad('device', 'packaged'),
    ipad('simulator', 'browser'),
    ipad('simulator', 'packaged'),
    android('device', 'browser'),
    android('device', 'packaged'),
    android('emulator', 'browser'),
    android('emulator', 'packaged'),
    mac('chromium', 'chrome', '120hz'),
    mac('webkit', 'safari', '60hz'),
    mac('firefox', 'firefox', '120hz'),
  ] as const,
  { regimes: DEFAULT_REFRESH_REGIMES }
);

/** The app-facing fidelity label the matrix renders; the package only knows gated versus advisory. */
export const FIDELITY_LABEL: Record<keyof typeof targets, string> = {
  'ipad-device-browser': 'physical-safari-gated',
  'ipad-device-packaged': 'physical-native-advisory',
  'ipad-simulator-browser': 'simulator-advisory',
  'ipad-simulator-packaged': 'simulator-advisory',
  'android-device-browser': 'physical-web-advisory',
  'android-device-packaged': 'physical-native-advisory',
  'android-emulator-browser': 'simulator-advisory',
  'android-emulator-packaged': 'simulator-advisory',
  'mac-chrome': 'desktop-advisory',
  'mac-safari': 'desktop-advisory',
  'mac-firefox': 'desktop-advisory',
};
