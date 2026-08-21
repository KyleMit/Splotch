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
const ACTIONS_APPIUM_COMMAND = 'perf:ios:xcuitest:actions';
const ACTIONS_CDP_COMMAND = 'perf:android:browser:actions';

export const CAMPAIGN_TARGETS = {
  'ipad-simulator-web': { label: 'iPad Simulator · web', transport: 'appium', runtime: 'web' },
  'ipad-simulator-native': {
    label: 'iPad Simulator · native',
    transport: 'appium',
    runtime: 'native',
  },
  'ipad-device-web': { label: 'iPad device · web', transport: 'appium', runtime: 'web' },
  'ipad-device-native': { label: 'iPad device · native', transport: 'appium', runtime: 'native' },
  'android-emulator-web': {
    label: 'Android emulator · web',
    transport: 'appium',
    runtime: 'web',
    // ADR-0092: browser frames come from Appium, browser actions from direct CDP.
    actionsTransport: 'cdp',
    webviewClass: 'android.webkit.WebView',
  },
  'android-emulator-native': {
    label: 'Android emulator · native',
    transport: 'appium',
    runtime: 'native',
    webviewClass: 'android.webkit.WebView',
  },
  'android-device-web': {
    label: 'Android device · web',
    transport: 'appium',
    runtime: 'web',
    actionsTransport: 'cdp',
    webviewClass: 'android.webkit.WebView',
  },
  'android-device-native': {
    label: 'Android device · native',
    transport: 'appium',
    runtime: 'native',
    webviewClass: 'android.webkit.WebView',
  },
};

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
      const artifact = artifactPath(outputRoot, targetId, mode, item);
      const runLabel = `${label ?? targetId}-${mode.id}-${item}`;

      const command = useCdp
        ? ACTIONS_CDP_COMMAND
        : isActions
          ? ACTIONS_APPIUM_COMMAND
          : SCREEN_COMMAND;

      // Direct CDP addresses the device itself and never borrows an Appium session.
      const transport = useCdp
        ? [
            ...(host.deviceId ? [`--device-id=${host.deviceId}`] : []),
            ...(host.cdpPort ? [`--cdp-port=${host.cdpPort}`] : []),
            ...(host.url ? [`--url=${host.url}`, '--no-serve'] : []),
          ]
        : transportArgs(target, host);

      const specific = isActions
        ? [
            `--orientation=${mode.orientation}`,
            `--theme=${mode.theme}`,
            `--repeats=${ACTION_REPEATS}`,
          ]
        : drawingArgs(item, mode);

      plan.push({
        id: `${mode.id}/${item}`,
        targetId,
        mode,
        item,
        artifact,
        command,
        // --report-only keeps a valid red gate instead of stopping the queue on it.
        args: [
          ...transport,
          ...specific,
          `--label=${runLabel}`,
          `--output=${artifact}`,
          '--report-only',
        ],
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
