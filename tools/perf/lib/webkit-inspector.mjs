// WebKit Inspector Protocol client for a physical iOS device, behind
// `npm run perf:ios:webkit:gates`.
//
// Safari on a real device exposes no CDP endpoint — which is why the Android
// path's connectOverCDP has no iOS sibling — but it does expose the WebKit
// Inspector Protocol over USB, the same channel Safari's own Web Inspector
// drives. `ios_webkit_debug_proxy` relays that channel to a localhost
// WebSocket; this module speaks the protocol over it.
//
// Two differences from CDP shape everything here:
//
//   * Commands are multiplexed through the Target domain. Sent bare, even
//     `Runtime.evaluate` answers "'Runtime' domain was not found" — it has to
//     be JSON-wrapped in Target.sendMessageToTarget and its reply unwrapped
//     from a Target.dispatchMessageFromTarget event, on an id space of its own.
//   * There is no `awaitPromise`. Evaluating a promise hands back the promise
//     object, so a long-running async payload is fired and then polled for the
//     global it publishes rather than awaited.

import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { pollUntil } from '../../lib/proc.mjs';

// ios_webkit_debug_proxy's own convention: one port listing the attached
// devices, and a range from which each device gets its page-list port.
const DEVICE_LIST_PORT = 9221;
const DEVICE_PORT_RANGE = '9222-9322';

const DEVICE_READY_TIMEOUT_MS = 20_000;
const DEVICE_POLL_INTERVAL_MS = 500;
const TARGET_ANNOUNCE_TIMEOUT_MS = 10_000;
const TARGET_POLL_INTERVAL_MS = 100;
const COMMAND_TIMEOUT_MS = 30_000;
const HTTP_TIMEOUT_MS = 5_000;

export const PROXY_COMMAND = 'ios_webkit_debug_proxy';

async function fetchJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url} answered HTTP ${response.status}`);
  return response.json();
}

// The relay runs for the length of the session; the caller owns stop().
export function startInspectorProxy() {
  const proxy = spawn(PROXY_COMMAND, ['-c', `null:${DEVICE_LIST_PORT},:${DEVICE_PORT_RANGE}`], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const errorOutput = [];
  proxy.stderr.setEncoding('utf8');
  proxy.stderr.on('data', (chunk) => errorOutput.push(chunk));

  const stop = () => {
    try {
      proxy.kill();
    } catch {
      // already gone
    }
  };
  process.on('exit', stop);

  return { proxy, stop, errorOutput };
}

// Devices appear a beat after the relay binds, so this polls rather than
// reading once. `deviceId` picks one when several are attached.
export async function waitForDevice(deviceId, timeoutMs = DEVICE_READY_TIMEOUT_MS) {
  return pollUntil(
    async () => {
      const devices = await fetchJson(`http://localhost:${DEVICE_LIST_PORT}/json`).catch(() => []);
      return devices.find((device) => !deviceId || device.deviceId === deviceId) ?? null;
    },
    timeoutMs,
    DEVICE_POLL_INTERVAL_MS
  );
}

// Safari's open tabs on that device. Empty until Safari is running with at
// least one tab and Web Inspector enabled in its settings.
export async function listPages(device) {
  return fetchJson(`http://${device.url}/json`).catch(() => []);
}

export async function attachToPage(
  webSocketDebuggerUrl,
  { onConsole, onEvent, commandTimeoutMs = COMMAND_TIMEOUT_MS } = {}
) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let outerId = 0;
  let innerId = 0;
  let targetId = null;

  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  // Past open, a socket error is reported through whichever command is in
  // flight; an unhandled 'error' event would take the process down instead.
  socket.on('error', () => {});

  socket.on('message', (raw) => {
    let envelope;
    try {
      envelope = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (envelope.method === 'Target.targetCreated') {
      // A tab announces a `frame` target alongside its `page` target, in no
      // guaranteed order — taking whichever arrives last can leave every
      // command addressed to a frame instead of the page.
      if (envelope.params.targetInfo.type === 'page')
        targetId = envelope.params.targetInfo.targetId;
      return;
    }
    if (envelope.method !== 'Target.dispatchMessageFromTarget') return;
    let message;
    try {
      message = JSON.parse(envelope.params.message);
    } catch {
      return;
    }
    const settle = pending.get(message.id);
    if (settle) {
      pending.delete(message.id);
      settle(message);
      return;
    }
    if (message.method === 'Console.messageAdded') onConsole?.(message.params.message);
    // Every other domain event, for a caller that enabled one. The Timeline
    // domain in particular reports its records this way rather than as command
    // replies, so a recording is a subscription, not a return value.
    else if (message.method) onEvent?.(message.method, message.params);
  });

  const announced = await pollUntil(
    () => targetId,
    TARGET_ANNOUNCE_TIMEOUT_MS,
    TARGET_POLL_INTERVAL_MS
  );
  if (!announced) {
    socket.close();
    throw new Error('The page never announced an inspector target');
  }

  function command(method, params = {}) {
    const id = ++innerId;
    return new Promise((resolve, reject) => {
      // A suspended tab acks the outer envelope and then never answers, so a
      // missing reply is the signal that the page isn't running — not an error
      // the protocol reports.
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} got no reply within ${commandTimeoutMs}ms`));
      }, commandTimeoutMs);
      pending.set(id, (message) => {
        clearTimeout(timer);
        resolve(message);
      });
      socket.send(
        JSON.stringify({
          id: ++outerId,
          method: 'Target.sendMessageToTarget',
          params: { targetId, message: JSON.stringify({ id, method, params }) },
        })
      );
    });
  }

  async function evaluate(expression) {
    const reply = await command('Runtime.evaluate', { expression, returnByValue: true });
    if (reply.error) throw new Error(`Runtime.evaluate failed: ${reply.error.message}`);
    const { result, wasThrown } = reply.result;
    if (wasThrown) throw new Error(`The page threw: ${result?.description ?? 'unknown error'}`);
    return result;
  }

  // Structured values cross as JSON text: WebKit's returnByValue still hands
  // back an opaque remote object for anything that isn't a primitive.
  async function readJson(expression) {
    const { value } = await evaluate(`JSON.stringify(${expression})`);
    return value === undefined ? undefined : JSON.parse(value);
  }

  try {
    await command('Runtime.enable');
    await command('Console.enable');
  } catch (error) {
    socket.close();
    throw error;
  }

  return {
    evaluate,
    readJson,
    // Raw domain access, for a caller driving something other than Runtime —
    // pair it with `onEvent` for a domain that reports through events.
    command,
    close: () => socket.close(),
  };
}
