// Expands a deployment-target campaign into its ordered queue of captures.
//
// The 2026-08-20 campaign ran from an untracked shell script in /private/tmp, so
// its queue shape, retry policy, and resume ledger survived only as long as that
// directory did — and the next campaign could reconstruct the commands only
// because the box happened not to have been cleaned. This module owns the part
// that is the same on every host: which cells exist, in what order, and where each
// one writes. Host identity — device ids, capability files, preview URLs — stays an
// input, so nothing device-specific is committed.

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
const GESTURE_REPEATS = 10;
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
export const CAMPAIGN_TARGETS = {
  'ipad-simulator-web': {
    captureRuntime: 'ios-safari',
    label: 'iPad Simulator · web',
    transport: 'appium',
    runtime: 'web',
    deviceClass: 'tablet',
  },
  'ipad-simulator-native': {
    captureRuntime: 'ios-capacitor-webview',
    label: 'iPad Simulator · native',
    transport: 'appium',
    runtime: 'native',
    deviceClass: 'tablet',
  },
  'ipad-device-web': {
    captureRuntime: 'ios-safari',
    label: 'iPad device · web',
    transport: 'appium',
    runtime: 'web',
    deviceClass: 'tablet',
  },
  'ipad-device-native': {
    captureRuntime: 'ios-capacitor-webview',
    label: 'iPad device · native',
    transport: 'appium',
    runtime: 'native',
    deviceClass: 'tablet',
  },
  'android-emulator-web': {
    captureRuntime: 'android-chrome',
    deviceClass: 'handset',
    label: 'Android emulator · web',
    transport: 'appium',
    runtime: 'web',
    // ADR-0092: browser frames come from Appium, browser actions from direct CDP.
    actionsTransport: 'cdp',
    webviewClass: 'android.webkit.WebView',
  },
  'android-emulator-native': {
    captureRuntime: 'android-capacitor-webview',
    deviceClass: 'handset',
    label: 'Android emulator · native',
    transport: 'appium',
    runtime: 'native',
    webviewClass: 'android.webkit.WebView',
  },
  'android-device-web': {
    captureRuntime: 'android-chrome',
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
    label: 'Mac · Chrome',
    transport: 'desktop',
    desktopEngine: 'chromium',
    actionsTransport: 'desktop',
    runtime: 'web',
    deviceClass: 'desktop',
  },
  'mac-safari': {
    captureRuntime: 'desktop-playwright',
    label: 'Mac · Safari',
    transport: 'desktop',
    desktopEngine: 'webkit',
    actionsTransport: 'desktop',
    runtime: 'web',
    deviceClass: 'desktop',
  },
  'mac-firefox': {
    captureRuntime: 'desktop-playwright',
    label: 'Mac · Firefox',
    transport: 'desktop',
    desktopEngine: 'firefox',
    actionsTransport: 'desktop',
    runtime: 'web',
    deviceClass: 'desktop',
  },
  'android-device-native': {
    captureRuntime: 'android-capacitor-webview',
    deviceClass: 'handset',
    label: 'Android device · native',
    transport: 'appium',
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
// eyeballed per cell; a queue of 20 is exactly where eyeballing stops happening.
// Acceptance stays "a parseable artifact" so a red gate survives, but the artifact
// has to be one of the thing the cell asked for.
export function artifactMatchesRuntime(artifact, runtime) {
  const isNative = artifact?.transport === NATIVE_TRANSPORT;
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
export function artifactPassedFidelity(artifact, { verdictRequired = false } = {}) {
  const passed = artifact?.fidelity?.passed;
  if (passed === undefined) return !verdictRequired;
  return passed === true;
}

// The commands that always write a `fidelity` block. Desktop capture does not, and
// the action runners score a different contract, so neither can be held to one.
const FIDELITY_REPORTING_COMMANDS = new Set([SCREEN_COMMAND, SPLIT_SCREEN_COMMAND]);

export function commandReportsFidelity(command) {
  return FIDELITY_REPORTING_COMMANDS.has(command);
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
function splitTransportArgs(target, host) {
  const args = [`--platform=${target.splitPlatform}`];
  if (target.splitPlatform === 'android' && host.deviceId) {
    args.push(`--device-serial=${host.deviceId}`);
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
  const brush = item === 'pen-undo' ? 'pen' : item;
  return [
    `--brush=${brush}`,
    `--gesture-repeats=${GESTURE_REPEATS}`,
    `--orientation=${mode.orientation}`,
    `--theme=${mode.theme}`,
  ];
}

function drawingArgs(item, mode) {
  const brush = item === 'pen-undo' ? 'pen' : item;
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

      plan.push({
        id: `${mode.id}/${item}`,
        targetId,
        mode,
        item,
        artifact,
        command,
        reportsFidelity: commandReportsFidelity(command),
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
