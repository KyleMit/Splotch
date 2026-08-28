// Expands a deployment-target campaign into its ordered queue of captures.
//
// The 2026-08-20 campaign ran from an untracked shell script in /private/tmp, so
// its queue shape, retry policy, and resume ledger survived only as long as that
// directory did — and the next campaign could reconstruct the commands only
// because the box happened not to have been cleaned. This module owns the part
// that is the same on every host: which cells exist, in what order, and where each
// one writes. Host identity — device ids, capability files, preview URLs — stays an
// input, so nothing device-specific is committed.

import { inputFidelity } from './input-fidelity.mjs';

export const CAMPAIGN_MODES = [
  { id: 'portrait-light', orientation: 'PORTRAIT', theme: 'light' },
  { id: 'portrait-dark', orientation: 'PORTRAIT', theme: 'dark' },
  { id: 'landscape-light', orientation: 'LANDSCAPE', theme: 'light' },
  { id: 'landscape-dark', orientation: 'LANDSCAPE', theme: 'dark' },
];

const DRAWING_ITEMS = ['pen-undo', 'crayon', 'magic', 'eraser'];
export const ALL_ITEMS = [...DRAWING_ITEMS, 'actions'];

// One warmup plus three scored samples — the action scorer rejects any other split.
export const ACTION_REPEATS = 4;
// Part of the published measurement contract, not a convenience default (issue
// 1297): the repeat count decides how much of a cell is first-touch work versus
// amortised repeat work, so cells captured with different counts are not
// comparable. Every drawing cell in a campaign is driven at this count, the
// capture records it, and artifact acceptance refuses a banked cell recording a
// different one.
export const GESTURE_REPEATS = 10;
export const UNDO_COUNT = 10;
export const MAX_ATTEMPTS = 3;

const SCREEN_COMMAND = 'perf:ios:xcuitest:screen';
// ADR-0135's transport. Drawing only: it has no undo phase and no gate-reporting
// flag, so a split cell carries a different argument vocabulary rather than the
// Appium one minus the parts that would be ignored.
export const SPLIT_SCREEN_COMMAND = 'perf:device:frames';
// Named because consumers branch on it: the split path captures drawing only, so
// a mode it produces has no undo artifact to name.
export const SPLIT_TRANSPORT = 'split';
// Desktop rows run entirely on the capture host through Playwright. Orientation
// is a viewport shape rather than a device rotation, and the matrix derives it
// back from the recorded viewport, so the two geometries have to stay a matched
// pair rather than two independent numbers.
const DESKTOP_SCREEN_COMMAND = 'perf:web:frames';
const DESKTOP_ACTIONS_COMMAND = 'perf:web:actions';
const DESKTOP_LANDSCAPE_VIEWPORT = '1366x915';
const DESKTOP_PORTRAIT_VIEWPORT = '915x1366';
const ACTIONS_APPIUM_COMMAND = 'perf:ios:xcuitest:actions';
const ACTIONS_CDP_COMMAND = 'perf:android:browser:actions';

// `captureRuntime` names which runtime's input-fidelity expectations a cell is
// judged against — see tools/perf/lib/input-fidelity.mjs. It is stated per target
// rather than derived from `runtime` plus the id, because the derivation would have
// to parse a platform out of a name and would silently pick a wrong table for the
// next target whose name does not follow the pattern.
// `refreshRegime` names the presentation rate this target's cells are scored
// against, set from measured captures — see tools/perf/lib/refresh-regime.mjs. null
// means no regime has been established from measurement yet, which is a gap to
// close rather than a licence to score anything.
export const CAMPAIGN_TARGETS = {
  'ipad-simulator-web': {
    captureRuntime: 'ios-safari',
    refreshRegime: null,
    label: 'iPad Simulator · web',
    transport: 'appium',
    runtime: 'web',
    deviceClass: 'tablet',
  },
  'ipad-simulator-native': {
    captureRuntime: 'ios-capacitor-webview',
    refreshRegime: null,
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
  },
  'ipad-device-native': {
    captureRuntime: 'ios-capacitor-webview',
    refreshRegime: '60hz',
    label: 'iPad device · native',
    transport: 'appium',
    runtime: 'native',
    deviceClass: 'tablet',
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
    refreshRegime: null,
    deviceClass: 'handset',
    label: 'Android emulator · native',
    transport: 'appium',
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
  },
};

// A native capture writes this; the two web transports (`browser` over Appium,
// `android-chrome-cdp`) write their own.
export const NATIVE_TRANSPORT = 'native-capacitor-webview';

// Several debuggable WebViews can satisfy the context search, so a native capture
// that attached to Chrome — or a web capture that attached to the installed app —
// produces a well-formed artifact and exits zero. The runbook asks for this to be
// checked explicitly because a queue of 20 is exactly where eyeballing stops
// happening. Acceptance stays "a parseable artifact" so a red gate survives, but
// the artifact has to be one of the thing the cell asked for.
// The transports whose artifacts legitimately carry `nativeApp: true`: the
// split runner (issue 1274) and the bundled CDP channel (issue 1323) attach
// to the installed app while keeping their own transport strings. The Appium
// native runner marks native-ness in `transport` itself.
const NATIVE_CAPABLE_TRANSPORTS = new Set(['split-input-measurement', 'cdp-bundled']);
const PACKAGED_APP_URLS = new Set(['capacitor://localhost', 'https://localhost']);

function isPackagedAppUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return PACKAGED_APP_URLS.has(`${url.protocol}//${url.host}`);
  } catch {
    return false;
  }
}

export function artifactMatchesRuntime(artifact, runtime) {
  // Contract-specific, fail-closed (the PR 1380 review): a bare
  // `nativeApp: true` must not override the artifact's actual transport — a
  // browser artifact wearing a stray native flag was accepted for a native
  // cell, which is the exact wrong-runtime banking this guard exists to stop.
  // An artifact whose fields contradict each other matches NEITHER runtime.
  const transport = artifact?.transport;
  const nativeFlag = artifact?.nativeApp === true;
  const isNative =
    transport === NATIVE_TRANSPORT || (NATIVE_CAPABLE_TRANSPORTS.has(transport) && nativeFlag);
  const contradictory =
    nativeFlag && transport !== NATIVE_TRANSPORT && !NATIVE_CAPABLE_TRANSPORTS.has(transport);
  if (contradictory) return false;
  if (
    transport === NATIVE_TRANSPORT &&
    artifact?.appUrl !== undefined &&
    !isPackagedAppUrl(artifact.appUrl)
  ) {
    return false;
  }
  return runtime === 'native' ? isNative : !isNative;
}

// The split transport writes its artifact BEFORE it fails the fidelity gate, so a
// capture that must not be scored still parses and still names the right runtime.
// Acceptance has to read the verdict the artifact carries, or the campaign banks
// exactly the unscoreable cells that transport exists to stop producing.
//
// A MISSING verdict is the subtle half. Tolerating it keeps the desktop transport
// working, which genuinely reports none — but applied to a transport that always
// writes one it fails open, and the cell it fails open on is the one whose verdict
// is mandatory. So tolerance is granted per transport rather than globally, and a
// runner that always writes a verdict has an absent one treated as no verdict at
// all rather than as consent.
// The verdict is RE-DERIVED by exactly the matrix's algorithm (the PR 1368
// review's blocking finding: the two readers disagreed on both absent-data
// boundaries, so a resumed campaign could bank an artifact the matrix judges
// differently). One rule, shared in shape with `rederiveFidelity`:
//
// - No stored `fidelity` block → null. The stored block is what marks a
//   fidelity-reporting capture; whether its absence refuses is
//   `verdictRequired`'s question, answered by the caller — never re-derive a
//   verdict for a transport that legitimately reports none (desktop, actions).
// - Stored block present and a judging runtime supplied → re-derive from the
//   recorded phase input, `{}` when the input is missing. A fidelity-reporting
//   artifact with no input re-derives to a FAILED verdict (trusted touch
//   cannot pass on nothing), exactly as the matrix scores it — a flattering
//   stored verdict with no measurements behind it is not a pass.
// - Stored block present, no judging runtime → the stored verdict, as banked.
export function effectiveFidelity(artifact, captureRuntime = null) {
  if (!artifact?.fidelity) return null;
  if (captureRuntime) {
    const input = artifact?.summaries?.phases?.[0]?.input;
    return inputFidelity(input && typeof input === 'object' ? input : {}, captureRuntime);
  }
  return artifact.fidelity;
}

export function artifactPassedFidelity(
  artifact,
  { verdictRequired = false, captureRuntime = null } = {}
) {
  const verdict = effectiveFidelity(artifact, captureRuntime);
  const passed = verdict?.passed;
  if (passed === undefined) return !verdictRequired;
  return passed === true;
}

// The commands that always write a `fidelity` block. Desktop capture does not, and
// the action runners score a different contract, so neither can be held to one.
const FIDELITY_REPORTING_COMMANDS = new Set([SCREEN_COMMAND, SPLIT_SCREEN_COMMAND]);

export function commandReportsFidelity(command) {
  return FIDELITY_REPORTING_COMMANDS.has(command);
}

// The same asymmetry, for the beat. A drawing capture records `summaries` as an
// object carrying `intervalMs`; the action runner records `summaries` as a LIST
// of per-action rows and measures no beat at all, so asking it for one yields
// "unrecognized" and a cell that can never be banked however many times it runs.
//
// Granted per command rather than by absence of the field, for the reason the
// fidelity comment above gives: tolerating a missing value globally fails open on
// exactly the capture whose value is mandatory. A drawing artifact with no beat
// is still refused.
// Every command that WRITES `summaries.intervalMs`, which is the desktop runner
// too — it was omitted at first, and the omission failed open on the three Mac
// targets, all of which declare a regime. An exemption list is the wrong shape to
// get wrong quietly: a missing entry reads as "this command measures no beat"
// rather than as a mistake.
const REFRESH_REGIME_REPORTING_COMMANDS = new Set([
  SCREEN_COMMAND,
  SPLIT_SCREEN_COMMAND,
  DESKTOP_SCREEN_COMMAND,
]);

export function commandReportsRefreshRegime(command) {
  return REFRESH_REGIME_REPORTING_COMMANDS.has(command);
}

// Where a planned cell's child will get its server from. Issue 1301: a campaign
// input a child needs, that the parent has, and does not pass (the third of
// the #1283 family) — four action cells burned twelve attempts against another
// checkout's build on the default preview port. Every source is safe against
// WRONG data — 'guarded-default' children call ensurePreviewServer, which
// reuses an already-serving default port only after the build-freshness guard
// and otherwise spawns their own fresh preview — so a guarded default costs
// retries when another worktree holds the port, never wrong numbers. The
// campaign therefore WARNS about guarded defaults (recommending --url) rather
// than refusing them; only a command this function does not know is refused,
// because nothing is proven about its fallback.
export function cellServerSource(cell) {
  if (cell.command === DESKTOP_SCREEN_COMMAND || cell.command === DESKTOP_ACTIONS_COMMAND) {
    return 'self-served';
  }
  if (cell.args.some((arg) => arg.startsWith('--url='))) return 'explicit-url';
  if (cell.args.some((arg) => arg.startsWith('--host='))) return 'probe-host';
  if (cell.args.includes('--native-app')) return 'native-server-url';
  if (
    cell.command === SCREEN_COMMAND ||
    cell.command === ACTIONS_APPIUM_COMMAND ||
    cell.command === ACTIONS_CDP_COMMAND
  ) {
    return 'guarded-default';
  }
  return null;
}

// Classified rather than matched against a list of spellings. A set of exact
// strings misses every other way to write the same address: `[::ffff:127.0.0.1]`
// walked past the first version of this guard and the campaign ran on against a
// host the phone can never reach. URL parsing normalizes that to `[::ffff:7f00:1]`,
// so the text form cannot be matched either — the address has to be expanded and
// classified.
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipv4Octets(host) {
  const match = IPV4.exec(host);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  return octets.every((part) => part <= 255) ? octets : null;
}

// 127/8 is loopback in its entirety, not just 127.0.0.1, and 0.0.0.0 is the
// unspecified address. Neither is reachable from another machine.
function unreachableIpv4(octets) {
  return octets[0] === 127 || octets.every((part) => part === 0);
}

// Returns the eight 16-bit groups, or null when this is not an IPv6 literal. The
// trailing-dotted-quad form (`::ffff:127.0.0.1`) is folded into two groups first.
function ipv6Groups(host) {
  if (!host.includes(':')) return null;
  let text = host;
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (tail) {
    const octets = ipv4Octets(tail[1]);
    if (!octets) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    text = `${text.slice(0, tail.index)}${high}:${low}`;
  }
  const [head, rest, extra] = text.split('::');
  if (extra !== undefined) return null;
  const parse = (part) => (part ? part.split(':').map((group) => parseInt(group, 16)) : []);
  const left = parse(head);
  const right = rest === undefined ? [] : parse(rest);
  if (left.concat(right).some((group) => !Number.isInteger(group) || group > 0xffff)) return null;
  if (rest === undefined) return left.length === 8 ? left : null;
  const gap = 8 - left.length - right.length;
  if (gap < 0) return null;
  return [...left, ...Array(gap).fill(0), ...right];
}

function isUnreachableFromDevice(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;

  const octets = ipv4Octets(host);
  if (octets) return unreachableIpv4(octets);

  const groups = ipv6Groups(host);
  if (!groups) return false;
  const leading = groups.slice(0, 5).every((group) => group === 0);
  // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (compatible) both carry a v4 address in
  // the last two groups, and a loopback there is loopback however it is spelled.
  if (leading && (groups[5] === 0xffff || groups[5] === 0)) {
    const embedded = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff];
    if (groups[5] === 0xffff || groups[6] !== 0) return unreachableIpv4(embedded);
  }
  // ::1 is loopback; :: is unspecified.
  return (
    groups.every((group) => group === 0) ||
    (leading && groups[5] === 0 && groups[6] === 0 && groups[7] === 1)
  );
}

export function probeHostProblem(probeHost) {
  if (!probeHost) {
    return 'pass --probe-host= — the split transport needs the probe host URL as the device sees it';
  }
  let parsed;
  try {
    parsed = new URL(probeHost);
  } catch {
    return `--probe-host=${probeHost} is not a URL`;
  }
  if (isUnreachableFromDevice(parsed.hostname)) {
    return `--probe-host=${probeHost} is a loopback address, which the device cannot reach — pass this host's LAN address`;
  }
  return null;
}

// Classifying the hostname TEXT is not enough: `localtest.me`, `lvh.me` and the
// whole `*.nip.io` family are ordinary names that DNS resolves to loopback, so
// they passed the literal check and the campaign ran on against a host that
// answers only to this machine — the original failure mode wearing a domain name.
//
// The resolver is injected so the test can be deterministic without a network.
export async function resolvedProbeHostProblem(
  probeHost,
  { lookup = defaultLookup, hostname = null } = {}
) {
  const literal = probeHostProblem(probeHost);
  if (literal) return literal;

  const host = hostname ?? new URL(probeHost).hostname.replace(/^\[|\]$/g, '');
  let addresses;
  try {
    addresses = await lookup(host);
  } catch {
    return `--probe-host=${probeHost} does not resolve — the device cannot reach a name that has no address`;
  }
  if (!addresses.length) {
    return `--probe-host=${probeHost} resolved to no addresses`;
  }
  // EVERY returned address must be reachable. One loopback answer among several is
  // still a host the device may connect to itself on.
  const unreachable = addresses.filter((address) => isUnreachableFromDevice(address));
  if (unreachable.length) {
    return (
      `--probe-host=${probeHost} resolves to ${unreachable.join(', ')}, which is loopback — ` +
      "the device would connect to itself. Pass this host's LAN address."
    );
  }
  return null;
}

async function defaultLookup(host) {
  const { lookup } = await import('node:dns/promises');
  const answers = await lookup(host, { all: true });
  return answers.map((answer) => answer.address);
}

export function campaignTarget(targetId) {
  const target = CAMPAIGN_TARGETS[targetId];
  if (!target) {
    throw new Error(
      `Unknown campaign target ${targetId} — expected one of ${Object.keys(CAMPAIGN_TARGETS).join(', ')}`
    );
  }
  return target;
}

function resolveModes(modeIds) {
  if (!modeIds?.length) return CAMPAIGN_MODES;
  return modeIds.map((id) => {
    const mode = CAMPAIGN_MODES.find((candidate) => candidate.id === id);
    if (!mode) {
      throw new Error(
        `Unknown campaign mode ${id} — expected one of ${CAMPAIGN_MODES.map((m) => m.id).join(', ')}`
      );
    }
    return mode;
  });
}

function resolveItems(itemIds) {
  if (!itemIds?.length) return ALL_ITEMS;
  return itemIds.map((id) => {
    if (!ALL_ITEMS.includes(id)) {
      throw new Error(`Unknown campaign item ${id} — expected one of ${ALL_ITEMS.join(', ')}`);
    }
    return id;
  });
}

// A drawing capture writes `<brush>-real-screen.json`; actions write `actions.json`
// in their own directory. Both are keyed by target/mode so no two cells collide.
export function artifactPath(outputRoot, targetId, mode, item) {
  const base = `${outputRoot}/${targetId}/${mode.id}`;
  if (item === 'actions') return `${base}/actions/actions.json`;
  const brush = item === 'pen-undo' ? 'pen' : item;
  return `${base}/${brush}-real-screen.json`;
}

// `--host` is the probe host as the DEVICE sees it, so it is a separate input from
// the preview URL the Appium path passes: a loopback address reaches the host's own
// browser and never the device, and fails as a page that will not load.
// The identity a split-transport target cannot be driven without, named as the
// campaign's own flag rather than as the flag the child command takes. Those
// differ — the campaign accepts `--device-id` and forwards `--device-serial` —
// and an operator who passes the child's spelling gets it silently ignored, then
// watches every cell fail on a message naming a flag they did not type. That cost
// a 20-cell target sixty attempts on 2026-08-23 before anyone read the child's
// stderr closely enough to notice.
export function splitTransportIdentityProblem(target, host) {
  if (target?.transport !== 'split') return null;
  if (target.splitPlatform === 'android' && !host?.deviceId) {
    return (
      `${target.id} drives its drawing cells over the split transport and needs the phone's ` +
      'serial. Pass --device-id=<serial> (the campaign spells it --device-id even though ' +
      'perf:device:frames takes --device-serial).'
    );
  }
  if (target.splitPlatform === 'ios' && !host?.wdaUrl) {
    return (
      `${target.id} drives its drawing cells over the split transport and needs a running ` +
      'WebDriverAgent. Pass --wda-url=<url>.'
    );
  }
  return null;
}

function splitTransportArgs(target, host) {
  const args = [`--platform=${target.splitPlatform}`];
  // The split runner opens the installed app instead of a browser tab; the
  // page still arrives from the probe host through the app's server.url.
  if (target.runtime === 'native') args.push('--native-app');
  if (target.splitPlatform === 'android' && host.deviceId) {
    args.push(`--device-serial=${host.deviceId}`);
  }
  if (target.splitPlatform === 'android' && host.cdpPort) {
    args.push(`--cdp-port=${host.cdpPort}`);
  }
  if (target.splitPlatform === 'ios' && host.wdaUrl) args.push(`--wda-url=${host.wdaUrl}`);
  if (host.probeHost) args.push(`--host=${host.probeHost}`);
  return args;
}

export function desktopViewport(orientation) {
  return orientation === 'PORTRAIT' ? DESKTOP_PORTRAIT_VIEWPORT : DESKTOP_LANDSCAPE_VIEWPORT;
}

// The desktop capture records no `orientation` field; the matrix derives it from
// the viewport it did record (`width > height ? LANDSCAPE : PORTRAIT`) and refuses
// a capture whose derived mode disagrees with the cell it was filed under. So the
// viewport IS the orientation here, and a square one would be rejected.
function desktopArgs(target, mode, item, host) {
  const args = [
    `--engine=${target.desktopEngine}`,
    `--viewport=${desktopViewport(mode.orientation)}`,
    `--theme=${mode.theme}`,
  ];
  if (host.url) args.push(`--url=${host.url}`);
  if (item === 'actions') {
    args.push(`--repeats=${ACTION_REPEATS}`, '--report-only');
    return args;
  }
  const brush = item === 'pen-undo' ? 'pen' : item;
  args.push(`--brush=${brush}`);
  if (item === 'pen-undo') args.push(`--undo-count=${UNDO_COUNT}`);
  return args;
}

function transportArgs(target, host) {
  const args = [];
  if (host.appiumUrl) args.push(`--appium-url=${host.appiumUrl}`);
  if (host.capabilitiesFile) args.push(`--capabilities-file=${host.capabilitiesFile}`);
  if (host.deviceId) args.push(`--device-id=${host.deviceId}`);
  if (target.runtime === 'native') {
    args.push('--native-app');
    if (target.webviewClass) args.push(`--native-webview-class=${target.webviewClass}`);
  } else if (host.url) {
    args.push(`--url=${host.url}`, '--no-serve');
  }
  return args;
}

// The split runner takes no undo phase and no --report-only. Emitting them anyway
// would be silently dropped, which is the shape of every defect this campaign
// found: a flag that looks like it asked for something and did not.
function splitDrawingArgs(item, mode) {
  const brush = brushFor(item);
  return [
    `--brush=${brush}`,
    `--gesture-repeats=${GESTURE_REPEATS}`,
    `--orientation=${mode.orientation}`,
    `--theme=${mode.theme}`,
  ];
}

function drawingArgs(item, mode) {
  const brush = brushFor(item);
  const args = [
    `--brush=${brush}`,
    `--gesture-repeats=${GESTURE_REPEATS}`,
    `--orientation=${mode.orientation}`,
    `--theme=${mode.theme}`,
  ];
  // Only pen carries undo: a non-pen undo probe is "not requested", not a failure.
  if (item === 'pen-undo') args.splice(2, 0, `--undo-count=${UNDO_COUNT}`);
  return args;
}

function gestureRepeatsFromArgs(args) {
  const flag = args.find((arg) => arg.startsWith('--gesture-repeats='));
  if (!flag) return null;
  return Number(flag.slice('--gesture-repeats='.length));
}

function brushFor(item) {
  return item === 'pen-undo' ? 'pen' : item;
}

// How a repeat-driven capture feeds its passes ink (issue 1292): the eraser
// replays identical geometry every pass with the tiles refilled between passes
// — every pass erases full real ink — and every other brush replays identical
// geometry with no refill needed. Both capture runners write this value and
// acceptance compares against it, all through this one function, so the writer
// and the readers cannot drift. Artifacts predating the field are unrefilled
// fixed-geometry: their eraser passes 2..N erased mostly-transparent pixels,
// which is why an eraser cell recording a different plan is a different
// quantity, not a different label.
export function gesturePlanFor(brush) {
  return brush === 'eraser' ? 'fixed-geometry-refilled' : 'fixed-geometry';
}

// The gesture plan a drawing capture recorded, top level on both artifacts (the
// gestureRepeats top-level/automation split was a defect this field avoided
// from the start). Shared by acceptance and the matrix like
// `recordedGestureRepeats`. Null means the field is ABSENT, and unlike the
// repeat count that absence is determinate — every pre-field artifact is
// unrefilled fixed-geometry — yet consumers deliberately accept it: the
// standing decision (PR 1335's disposition, the issue-1225 record) keeps
// banked pre-fix evidence foldable until the campaign-end recapture supersedes
// it, and docs/PROFILING-CAMPAIGNS.md carries the do-not-compare caution for
// exactly that uncovered case. A field that is present but not a string is a
// malformed artifact and THROWS rather than collapsing into that null;
// acceptance maps the throw to a rejection, the matrix lets it surface as a
// loud fold error.
export function recordedGesturePlan(artifact) {
  const recorded = artifact?.gesturePlan ?? null;
  if (recorded === null) return null;
  if (typeof recorded !== 'string') {
    throw new Error(
      `the artifact records gesturePlan ${JSON.stringify(recorded)}, which is not a string — ` +
        'a malformed plan is an invalid artifact, not a historical one'
    );
  }
  return recorded;
}

// The repeat count a drawing capture recorded, wherever its runner filed it:
// the split transport writes it at the top level, the Appium screen runner
// inside `automation`. Shared by acceptance and the matrix so the two readers
// cannot drift (they briefly did, as private copies). Coerced to a number so a
// string-typed count in a foreign artifact compares by value rather than being
// hard-rejected by one reader and silently dropped by the other.
//
// Null means exactly one thing: the field is ABSENT — the artifact predates it
// or the runner has no gesture plan — which consumers deliberately accept,
// since refusing every historical artifact would force a full recapture. A
// field that is present but not a number is a malformed artifact, and it
// THROWS rather than collapsing into the same null (review round 2 proved a
// `gestureRepeats: "bogus"` artifact sailed through acceptance and the matrix
// filter as if it were historical). Acceptance maps the throw to a rejection;
// the matrix lets it surface as a loud fold error naming the source.
export function recordedGestureRepeats(artifact) {
  const recorded = artifact?.gestureRepeats ?? artifact?.automation?.gestureRepeats ?? null;
  if (recorded === null) return null;
  const count = Number(recorded);
  if (!Number.isFinite(count)) {
    throw new Error(
      `the artifact records gestureRepeats ${JSON.stringify(recorded)}, which is not a number — ` +
        'a malformed count is an invalid artifact, not a historical one'
    );
  }
  return count;
}

export function planCampaign(targetId, { modes, items, outputRoot, host = {}, label } = {}) {
  const target = campaignTarget(targetId);
  if (!outputRoot) throw new Error('planCampaign requires an outputRoot');
  const plan = [];

  for (const mode of resolveModes(modes)) {
    for (const item of resolveItems(items)) {
      const isActions = item === 'actions';
      const useCdp = isActions && target.actionsTransport === 'cdp';
      const useSplit = !isActions && target.transport === 'split';
      const useDesktop = target.transport === 'desktop';
      const artifact = artifactPath(outputRoot, targetId, mode, item);
      const runLabel = `${label ?? targetId}-${mode.id}-${item}`;

      const command = useDesktop
        ? isActions
          ? DESKTOP_ACTIONS_COMMAND
          : DESKTOP_SCREEN_COMMAND
        : useCdp
          ? ACTIONS_CDP_COMMAND
          : isActions
            ? ACTIONS_APPIUM_COMMAND
            : target.transport === 'split'
              ? SPLIT_SCREEN_COMMAND
              : SCREEN_COMMAND;

      // Direct CDP addresses the device itself and never borrows an Appium session.
      const transport = useCdp
        ? [
            ...(host.deviceId ? [`--device-id=${host.deviceId}`] : []),
            ...(host.cdpPort ? [`--cdp-port=${host.cdpPort}`] : []),
            ...(host.url ? [`--url=${host.url}`, '--no-serve'] : []),
          ]
        : useSplit
          ? splitTransportArgs(target, host)
          : transportArgs(target, host);

      const specific = useSplit
        ? splitDrawingArgs(item, mode)
        : isActions
          ? [
              `--orientation=${mode.orientation}`,
              `--theme=${mode.theme}`,
              `--repeats=${ACTION_REPEATS}`,
              // The Appium session exposes no device class for a physical device, so the
              // gate ledger that is scoped to one cannot infer it. The campaign knows.
              // Only the Appium runner reads it; the CDP one rejects unknown flags.
              ...(useCdp ? [] : [`--device-class=${target.deviceClass}`]),
            ]
          : drawingArgs(item, mode);

      const args = useDesktop
        ? [...desktopArgs(target, mode, item, host), `--label=${runLabel}`, `--output=${artifact}`]
        : [
            ...transport,
            ...specific,
            `--label=${runLabel}`,
            `--output=${artifact}`,
            // --report-only keeps a valid red gate instead of stopping the queue on it.
            ...(useSplit ? [] : ['--report-only']),
          ];

      // Read back from the args the child is actually given, so the contract
      // the inspection enforces can never drift from the command it drove.
      const gestureRepeats = gestureRepeatsFromArgs(args);
      plan.push({
        id: `${mode.id}/${item}`,
        targetId,
        mode,
        item,
        artifact,
        command,
        reportsFidelity: commandReportsFidelity(command),
        reportsRefreshRegime: commandReportsRefreshRegime(command),
        gestureRepeats,
        // Exactly the repeat-driven cells carry a gesture plan: the desktop
        // transport drives the probe's own synthetic driver and the action
        // sweeps drive no gesture, and neither takes --gesture-repeats — so the
        // flag's presence, not a second transport switch, decides both.
        gesturePlan: gestureRepeats === null ? null : gesturePlanFor(brushFor(item)),
        args,
      });
    }
  }

  const paths = plan.map((cell) => cell.artifact);
  const duplicate = paths.find((path, index) => paths.indexOf(path) !== index);
  if (duplicate) {
    throw new Error(`Campaign plan would overwrite ${duplicate} — output paths must be unique`);
  }
  return plan;
}

// The refill entries that prove an eraser capture's passes 2..N erased real ink
// (issue 1302 records them; issue 1355 decided they invalidate). The in-page
// recorder deliberately records an anomaly rather than throwing — aborting
// mid-gesture would destroy the capture the evidence exists to judge — and THIS
// is the reader that decision was waiting on: acceptance refuses the artifact,
// the matrix refuses the fold, and the recorded proof is what both act on.
//
// Null means the field is absent: a non-eraser capture, or an artifact banked
// before the recorder existed — accepted by the same standing decision as the
// absent plan, with the pre-refill eraser numbers already marked optimistic and
// superseded. A present field that is not an array is a malformed artifact and
// throws, exactly as a malformed plan or count does. An entry is anomalous when
// the refill errored, was still pending (backings not realized — the fill would
// have been wiped), or left transparent tiles (passes after it erased nothing).
export function anomalousEraserRefills(artifact) {
  const recorded = artifact?.eraserRefills ?? null;
  if (recorded === null) return null;
  if (!Array.isArray(recorded)) {
    throw new Error(
      `the artifact records eraserRefills ${JSON.stringify(recorded)}, which is not a list — ` +
        'a malformed refill record is an invalid artifact, not a historical one'
    );
  }
  // FAIL CLOSED at the entry level (the PR 1363 review probed truthy-array
  // `pending` — the recorder's own pre-coercion shape — plus `{}` and `null`
  // entries through acceptance, and all three banked): an entry is healthy only
  // when it affirmatively proves it, and any shape this reader does not
  // recognize counts as anomalous rather than as consent.
  return recorded.filter((refill) => !healthyRefillEntry(refill));
}

function healthyRefillEntry(refill) {
  return (
    refill !== null &&
    typeof refill === 'object' &&
    refill.error === undefined &&
    refill.pending === false &&
    Array.isArray(refill.transparentTiles) &&
    refill.transparentTiles.length === 0
  );
}

// The refill recorder is armed with (strokesPerRepeat, repeats x
// strokesPerRepeat) and refills after every repeat's last stroke except the
// final one, so a complete eraser capture records exactly repeats - 1 entries.
// Fewer means refills silently never fired — zero recorded anomalies while the
// later passes erased blank paper, the exact state the record exists to refuse
// (the review's finding: the record proves recorded anomalies, not that
// refills happened). Null when there is nothing to hold to a count: an absent
// field (historical tolerance) or no expected repeat contract.
export function eraserRefillShortfall(artifact, expectedRepeats) {
  const recorded = artifact?.eraserRefills ?? null;
  if (recorded === null || !Array.isArray(recorded)) return null;
  if (!Number.isFinite(expectedRepeats) || expectedRepeats < 2) return null;
  const expectedRefills = expectedRepeats - 1;
  if (recorded.length === expectedRefills) return null;
  return { recorded: recorded.length, expected: expectedRefills };
}
