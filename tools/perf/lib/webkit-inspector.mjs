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
import { ROOT, pollUntil } from '../../lib/proc.mjs';
import { portListenerOwners } from '../../lib/vite-server.mjs';
import { PORT_ROLES, resolvePort } from './capture-readiness.mjs';

// ios_webkit_debug_proxy's own convention: one port listing the attached
// devices, and a range from which each device gets its page-list port.
const DEVICE_LIST_PORT = PORT_ROLES.inspector.port;
const DEVICE_PORT_RANGE = '9222-9322';
// A relay that cannot bind a port says so on stderr and keeps running, so its
// exit alone never shows that another process is answering in its place.
const BIND_FAILURE = /Unable to bind/;

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
// failure() stays null until the relay exits, fails to start, or reports a
// port it could not bind, and then holds the relay's own account of it.
export function startInspectorProxy() {
  const proxy = spawn(PROXY_COMMAND, ['-c', `null:${DEVICE_LIST_PORT},:${DEVICE_PORT_RANGE}`], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const errorOutput = [];
  let ended = null;
  proxy.stderr.setEncoding('utf8');
  proxy.stderr.on('data', (chunk) => errorOutput.push(chunk));
  // A binary that never started reports 'error' and no exit. 'close' rather
  // than 'exit', because only 'close' waits for the last of stderr.
  proxy.on('error', (error) => (ended ??= error.message));
  proxy.on('close', (code, signal) => {
    ended ??= `${PROXY_COMMAND} exited ${signal ? `on ${signal}` : `with code ${code}`}`;
  });

  const stop = () => {
    try {
      proxy.kill();
    } catch {
      // already gone
    }
  };
  process.on('exit', stop);

  const failure = () => {
    const stderr = errorOutput.join('').trim();
    if (ended) return [ended, stderr].filter(Boolean).join('\n');
    return BIND_FAILURE.test(stderr) ? stderr : null;
  };

  return { proxy, stop, errorOutput, failure };
}

// What answers on the port is this relay only while its process listens there
// alone. stderr cannot say so: a holder bound to 127.0.0.1 lets the relay's
// wildcard bind succeed in silence and still takes every localhost request,
// and a failed bind reaches stderr with no guaranteed lead over a holder's
// answer. lsof is the only witness, so a listener it cannot name fails closed.
function listenerProblem(relay) {
  const listeners = portListenerOwners(DEVICE_LIST_PORT, ROOT);
  const other = listeners.find(({ pid }) => pid !== relay.proxy.pid);
  if (other) {
    const holder = { pid: other.pid, cwd: other.cwd, ours: other.owned };
    return `port ${DEVICE_LIST_PORT} is ${resolvePort('inspector', { holder }).reason}`;
  }
  if (listeners.length > 0) return null;
  return `lsof names no listener on port ${DEVICE_LIST_PORT}, so this relay cannot be shown to serve it`;
}

// Devices appear a beat after the relay binds, so this polls rather than
// reading once. `deviceId` picks one when several are attached. Resolves to
// `{ device }` only for a device this relay listed, to `{ problem }` once the
// relay cannot serve or shares its port, and to `{}` when no device appeared.
export async function waitForDevice(relay, deviceId, timeoutMs = DEVICE_READY_TIMEOUT_MS) {
  const outcome = await pollUntil(
    async () => {
      const failure = relay.failure();
      if (failure) return { problem: failure };
      const devices = await fetchJson(`http://localhost:${DEVICE_LIST_PORT}/json`).catch(() => []);
      const device = devices.find((entry) => !deviceId || entry.deviceId === deviceId);
      return device && { device };
    },
    timeoutMs,
    DEVICE_POLL_INTERVAL_MS
  );
  if (outcome?.problem) return outcome;
  const problem = relay.failure() ?? listenerProblem(relay);
  return problem ? { problem } : (outcome ?? {});
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
    const onOpen = () => {
      socket.removeEventListener('error', onError);
      resolve();
    };
    // The platform WebSocket reports a failed handshake as an ErrorEvent whose
    // message names no cause ("Received network error or non-101 status code."),
    // so the fallback covers only a dispatch carrying no message at all.
    const onError = (event) => {
      socket.removeEventListener('open', onOpen);
      reject(new Error(event.message ?? 'The inspector WebSocket failed to open'));
    };
    socket.addEventListener('open', onOpen, { once: true });
    socket.addEventListener('error', onError, { once: true });
  });
  // Past open, a socket error is reported through whichever command is in
  // flight. No listener is registered for it: an EventTarget drops an
  // unobserved 'error' event, where the EventEmitter this once used would have
  // rethrown it and taken the process down.

  socket.addEventListener('message', (event) => {
    let envelope;
    try {
      envelope = JSON.parse(event.data);
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
