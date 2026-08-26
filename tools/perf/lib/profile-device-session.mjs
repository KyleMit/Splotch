// Device-session plumbing shared by the iPad entry points: the USB relay, the
// LAN preview server, tab selection, navigation, readiness, and the
// poll-for-a-global convention the protocol forces on anything long-running.
//
// `perf:ios:webkit:gates` (the /dev/engine gates run) and `perf:ios:webkit:frames` (frame pacing
// on the real screen) differ only in the URL they open, how they know the page
// is ready, and which global they wait for — everything else here is protocol
// and device behaviour that cost real debugging sessions to learn, and must not
// be reimplemented per entry point. See `webkit-inspector.mjs` for the protocol
// itself and docs/PROFILING-IPAD.md for the runbook.

import { fail, hasCommand, pollUntil, sleep } from '../../lib/proc.mjs';
import { lanAddresses, waitForUrl } from '../../lib/net.mjs';
import { assertServedBuildIsFresh } from './profile-preview.mjs';
import { spawnPerfServe } from '../serve-profile-build.mjs';
import { rethrowIfBroken } from './error-classification.mjs';
import {
  PROXY_COMMAND,
  attachToPage,
  listPages,
  startInspectorProxy,
  waitForDevice,
} from './webkit-inspector.mjs';

const EXISTING_SERVER_PROBE_MS = 1_500;
const SERVER_READY_TIMEOUT_MS = 90_000;
const PAGE_LIST_TIMEOUT_MS = 20_000;
const PAGE_LIST_POLL_INTERVAL_MS = 500;
const NAVIGATION_SETTLE_MS = 1_500;
const PAGE_READY_TIMEOUT_MS = 60_000;
const PAGE_POLL_INTERVAL_MS = 500;
// Long enough for a live tab under load to answer a trivial evaluate, short
// enough that walking several suspended tabs stays quick.
const LIVENESS_PROBE_TIMEOUT_MS = 5_000;
const RESULT_POLL_INTERVAL_MS = 2_000;
const HEARTBEAT_INTERVAL_MS = 30_000;

export function requireInspectorProxy() {
  if (hasCommand(PROXY_COMMAND)) return;
  fail(
    `${PROXY_COMMAND} is not installed — it relays the iPad's WebKit inspector ` +
      'channel over USB. Install it with:\n  brew install ios-webkit-debug-proxy'
  );
}

// The URL the *iPad* opens, so it has to be a LAN address: localhost on the Mac
// is a different machine from the device's point of view.
export function resolveDeviceUrl(explicit, port, path) {
  if (explicit) return explicit;
  const [address] = lanAddresses();
  if (!address) {
    fail('No LAN address for the iPad to reach this Mac at. Join a Wi-Fi network, or pass --url=');
  }
  return `http://${address}:${port}${path}`;
}

const reachable = (url, timeoutMs) =>
  waitForUrl(url, timeoutMs).then(
    () => true,
    () => false
  );

// The build check runs here rather than in each device runner, because every iOS
// device path reaches its preview through this function — and until it did, only
// the two DESKTOP runners verified the build at all. A native export written after
// a preview started, or a port held by another checkout, could reach a device cell
// unchallenged.
//
// `allowForeignBuild` is the documented escape for an externally served historical
// build, which by definition is not this checkout's.
export async function ensurePreviewServer(url, port, allowSpawn, { allowForeignBuild } = {}) {
  if (await reachable(url, EXISTING_SERVER_PROBE_MS)) {
    console.log(`Serving already: ${url}`);
    await assertServedBuildIsFresh(url, { allowForeignBuild });
    return null;
  }
  if (!allowSpawn) fail(`Nothing is serving ${url}. Start it with: npm run perf:serve`);
  console.log('Starting the preview server…');
  // The same port the URL was derived from, strictly: a fall-forward would
  // leave this waiting out its whole budget on a URL nothing ever binds.
  const server = spawnPerfServe(port);
  await waitForUrl(url, SERVER_READY_TIMEOUT_MS);
  await assertServedBuildIsFresh(url, { allowForeignBuild });
  console.log(`Serving: ${url}`);
  return server;
}

// Starts the relay and picks a device off it; the caller owns stopProxy() for
// the length of the run.
export async function connectDevice(deviceId) {
  const { stop: stopProxy } = startInspectorProxy();
  const device = await waitForDevice(deviceId);
  if (!device) {
    stopProxy();
    fail(
      'No iOS device on the inspector relay. Connect the iPad by USB, unlock it, tap ' +
        'Trust This Computer, and turn on Settings → Apps → Safari → Advanced → Web Inspector.'
    );
  }
  console.log(`Device: ${device.deviceName} (iOS ${device.deviceOSVersion})`);
  return { device, stopProxy };
}

// iOS suspends a backgrounded Safari tab: it still lists, and still announces an
// inspector target, but it never runs JS — so a command against it hangs instead
// of failing, and the first-listed tab is not reliably the foreground one. A
// short-budget probe is the only way to tell them apart.
async function findResponsivePage(device, accept = () => true) {
  for (const page of await listPages(device)) {
    if (!accept(page)) continue;
    let session;
    try {
      session = await attachToPage(page.webSocketDebuggerUrl, {
        commandTimeoutMs: LIVENESS_PROBE_TIMEOUT_MS,
      });
      await session.evaluate('1');
      return page;
    } catch (error) {
      rethrowIfBroken(error);
      // Suspended, or the tab went away mid-probe.
    } finally {
      session?.close();
    }
  }
  return null;
}

// Navigates the live tab to `url` rather than trusting one that already shows
// it: a tab left over from an earlier run keeps serving that run's bundle, and
// nothing about its URL says so. `ready` is an expression evaluated on the
// device until it answers truthy — each entry point knows a different thing
// about the page it opened (the harness exposes window.__engine; the real screen
// has only its live canvas), so the gate is the caller's to supply.
export async function openDevicePage(device, url, { onConsole, onEvent, ready, readyHint }) {
  const pages = await pollUntil(
    async () => {
      const open = await listPages(device);
      return open.length ? open : null;
    },
    PAGE_LIST_TIMEOUT_MS,
    PAGE_LIST_POLL_INTERVAL_MS
  );
  if (!pages) {
    fail(
      'The iPad exposes no Safari pages. Open Safari on the device with at least one ' +
        'tab, and turn on Settings → Apps → Safari → Advanced → Web Inspector.'
    );
  }

  const live = await pollUntil(
    () => findResponsivePage(device),
    PAGE_LIST_TIMEOUT_MS,
    PAGE_LIST_POLL_INTERVAL_MS
  );
  if (!live) {
    fail(
      `None of the iPad's ${pages.length} Safari tab(s) answered. Bring Safari to the ` +
        'foreground, unlock the device, and keep the screen awake — iOS suspends a ' +
        'backgrounded tab, and a suspended tab never runs anything injected into it.'
    );
  }

  const opener = await attachToPage(live.webSocketDebuggerUrl);
  await opener.evaluate(`location.replace(${JSON.stringify(url)})`);
  opener.close();
  await sleep(NAVIGATION_SETTLE_MS);

  // Matched on URL *and* responsiveness: with several tabs open, the one showing
  // the target URL is not necessarily the one that will run anything.
  const loaded = await pollUntil(
    () => findResponsivePage(device, (page) => page.url === url),
    PAGE_READY_TIMEOUT_MS,
    PAGE_POLL_INTERVAL_MS
  );
  if (!loaded) {
    fail(
      `The iPad never reported a responsive tab on ${url}. Check that the device is ` +
        'on the same Wi-Fi as this Mac and can reach that address.'
    );
  }

  const session = await attachToPage(loaded.webSocketDebuggerUrl, { onConsole, onEvent });
  const isReady = await pollUntil(
    () =>
      session.readJson(`!!(${ready})`).catch((error) => {
        rethrowIfBroken(error);
        return false;
      }),
    PAGE_READY_TIMEOUT_MS,
    PAGE_POLL_INTERVAL_MS
  );
  if (!isReady) {
    session.close();
    fail(`${url} loaded but ${readyHint}`);
  }
  return session;
}

// The device's console, collected for the report and echoed as the run's
// progress narration. An injected payload's own console.error is how it reports
// a fatal condition — there is no other channel back.
export function createDeviceConsole({ echo = () => true } = {}) {
  const messages = [];
  return {
    messages,
    onConsole(message) {
      messages.push(message);
      if (message.source === 'console-api' && echo(message)) {
        console.log(`  [iPad] ${message.text}`);
      }
    },
    errorText: () =>
      messages.find((message) => message.level === 'error' && message.source === 'console-api')
        ?.text,
    forReport: () => messages.map(({ level, text }) => ({ level, text })),
  };
}

// WebKit has no `awaitPromise`, so an injected async payload is fired and then
// polled for the global it publishes. `stalled()` surfaces the payload's own
// fatal error instead of waiting out the whole budget; `progress()` reads
// whatever the payload publishes about where it is, for the heartbeat line.
export async function waitForGlobal(
  session,
  expression,
  { stalled, timeoutMs, timeoutHint, progress }
) {
  const start = Date.now();
  const deadline = start + timeoutMs;
  let nextHeartbeat = start + HEARTBEAT_INTERVAL_MS;
  while (Date.now() < deadline) {
    const stopped = stalled?.();
    if (stopped) throw new Error(`The injected script stopped early:\n${stopped}`);
    const value = await session.readJson(`${expression} ?? null`);
    if (value) return value;
    if (Date.now() >= nextHeartbeat) {
      const where = progress ? await progress().catch(() => null) : null;
      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(`  … running (${elapsed}s)${where ? ` · ${where}` : ''}`);
      nextHeartbeat += HEARTBEAT_INTERVAL_MS;
    }
    await sleep(RESULT_POLL_INTERVAL_MS);
  }
  throw new Error(
    `${expression} never appeared within ${Math.round(timeoutMs / 60_000)} min. ` + timeoutHint
  );
}
