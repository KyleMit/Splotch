// The eleven deployment targets, as data, under the ids the shipped registry, the campaign artifact
// paths and the tracked evidence already use (`web` and `native` name the shell in the id; `shell`
// and `pageDelivery` carry the vocabulary). docs/PROFILING-MECHANICS.md restates this table and a
// Splotch-owned test holds the two together through the package's resolveTransports.
import {
  DEFAULT_REFRESH_REGIMES,
  defineTargets,
  type RegimeIdOf,
  type TargetDefinition,
} from 'perf-rig';

export type SplotchRuntime =
  | 'ios-safari'
  | 'ios-capacitor-webview'
  | 'android-chrome'
  | 'android-capacitor-webview'
  | 'desktop-playwright';
export type SplotchRegime = RegimeIdOf<typeof DEFAULT_REFRESH_REGIMES>;

type Target<Id extends string> = TargetDefinition<SplotchRuntime, SplotchRegime> & {
  readonly id: Id;
};

type ShellId = 'web' | 'native';
const SHELL = { web: 'browser', native: 'packaged' } as const;

const ipad = <const H extends 'device' | 'simulator', const S extends ShellId>(
  host: H,
  shellId: S
): Target<`ipad-${H}-${S}`> => ({
  id: `ipad-${host}-${shellId}`,
  label: `iPad ${host} · ${shellId}`,
  platform: 'ios',
  host,
  shell: SHELL[shellId],
  deviceClass: 'tablet',
  captureRuntime: shellId === 'web' ? 'ios-safari' : 'ios-capacitor-webview',
  refreshRegime: '60hz',
  transports: { drawing: 'appium', actions: 'appium', measurement: 'appium-execute' },
  instruments: ['host-quiet'],
  evidenceRole: host === 'device' && shellId === 'web' ? 'gated' : 'advisory',
  physicalDevice: host === 'device',
});

// ADR-0135: the native shell draws over the split transport with the instrumented export loaded
// from the served preview (remote delivery, `pageIdentity: unprovable`) and measures its discrete
// actions over Appium against the packaged origin; a bundled frames capture over CDP is packaged
// too. The delivery follows the request's channel through resolvePageDelivery, so one target
// serves all three.
const android = <const H extends 'device' | 'emulator', const S extends ShellId>(
  host: H,
  shellId: S
): Target<`android-${H}-${S}`> => ({
  id: `android-${host}-${shellId}`,
  label: `Android ${host} · ${shellId}`,
  platform: 'android',
  host,
  shell: SHELL[shellId],
  deviceClass: 'handset',
  captureRuntime: shellId === 'web' ? 'android-chrome' : 'android-capacitor-webview',
  refreshRegime: host === 'device' ? '120hz' : '60hz',
  transports: {
    drawing: 'adb-input',
    actions: shellId === 'web' ? 'cdp-touch' : 'appium',
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
  ] as const,
  { regimes: DEFAULT_REFRESH_REGIMES }
);

/** The app-facing fidelity label the matrix renders; the package only knows gated versus advisory. */
export const FIDELITY_LABEL: Record<keyof typeof targets, string> = {
  'ipad-device-web': 'physical-safari-gated',
  'ipad-device-native': 'physical-native-advisory',
  'ipad-simulator-web': 'simulator-advisory',
  'ipad-simulator-native': 'simulator-advisory',
  'android-device-web': 'physical-web-advisory',
  'android-device-native': 'physical-native-advisory',
  'android-emulator-web': 'simulator-advisory',
  'android-emulator-native': 'simulator-advisory',
  'mac-chrome': 'desktop-advisory',
  'mac-safari': 'desktop-advisory',
  'mac-firefox': 'desktop-advisory',
};
