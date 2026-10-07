import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { digest, FIXTURE_PATH } from './contract.mjs';
import { evidence } from './command-evidence.mjs';
import { fixtureCommandExpression } from './android-writer-ack.mjs';
import { connectFixtureSession } from './cdp-session.mjs';
import { guardedAdbCommand } from './adb-server.mjs';
import { commandRemainingMs, beginCommandCleanup } from './command-timing.mjs';
import { verifyPageReport } from './report-contract.mjs';
import {
  installedAPKPath,
  coloringRootInventory,
  androidProvider,
  verifyChromiumProvider,
} from './android-runtime-inputs.mjs';

const PAGE_DEADLINE_MS = 30_000;
const COMMAND_DEADLINE_MS = 30_000;
const POLL_INTERVAL_MS = 100;
const SOCKET_CLOSE_DEADLINE_MS = 2_000;

function processStartTicks(bytes) {
  const text = bytes.toString().trim();
  const fields = text.slice(text.lastIndexOf(')') + 2).split(/\s+/);
  assert.match(fields[19], /^\d+$/, 'L0_ANDROID_PROCESS_STAT_INVALID');
  return fields[19];
}

async function closeConnections(context) {
  const failures = [];
  for (const connection of context.cdpConnections ?? []) {
    const { socket, wire } = connection;
    try {
      socket.close();
      const deadline = Date.now() + commandRemainingMs(context, SOCKET_CLOSE_DEADLINE_MS);
      while (socket.readyState !== WebSocket.CLOSED && Date.now() < deadline)
        await delay(POLL_INTERVAL_MS);
      assert.equal(socket.readyState, WebSocket.CLOSED, 'L0_CDP_SOCKET_REMAINS');
      const bytes = readFileSync(wire);
      context.artifacts.push({
        path: 'cdp-wire.jsonl.txt',
        bytes: bytes.length,
        sha256: digest(bytes),
        complete: true,
      });
      connection.finalized = true;
    } catch (error) {
      failures.push(error);
    }
  }
  evidence(
    context,
    'cdp-settlement.json.txt',
    JSON.stringify(
      (context.cdpConnections ?? []).map(({ socket, closed, finalized }) => ({
        readyState: socket.readyState,
        closed,
        finalized,
      })),
      null,
      2
    )
  );
  if (failures.length) throw new AggregateError(failures, 'L0_CDP_FINALIZATION_UNSETTLED');
}

async function runtimeIdentity(context, adb) {
  assert.match(context.lease.device, /^emulator-\d+$/, 'L0_PHYSICAL_ANDROID_REFUSED');
  const name = (await adb(['emu', 'avd', 'name'])).toString().trim().split(/\r?\n/)[0];
  assert.equal(name, context.lease.deviceName, 'L0_ANDROID_DEVICE_OWNERSHIP_MISMATCH');
  const path = installedAPKPath(await adb(['shell', 'pm', 'path', 'art.splotch.app']));
  const apk = await adb(['exec-out', 'cat', path]);
  assert.equal(digest(apk), context.lease.artifactSha256, 'L0_INSTALLED_APK_CHANGED');
  const descendants = await adb([
    'exec-out',
    'run-as',
    'art.splotch.app',
    'sh',
    '-c',
    "if [ -d no_backup/coloring ]; then printf 'L0_COLORING_ROOT_PRESENT\\n'; find no_backup/coloring -mindepth 1; else printf 'L0_COLORING_ROOT_ABSENT\\n'; fi",
  ]);
  evidence(
    context,
    'post-attach-coloring-inventory.json.txt',
    JSON.stringify({ ...coloringRootInventory(descendants), commandId: context.lastAdbCall.id }) +
      '\n'
  );
  const provider = androidProvider(context, await adb(['shell', 'dumpsys', 'webviewupdate']));
  evidence(context, 'webview-provider.json.txt', JSON.stringify(provider, null, 2));
  await adb(['shell', 'dumpsys', 'package', 'art.splotch.app']);
  await adb(['shell', 'dumpsys', 'jobscheduler']);
  const pidText = (await adb(['shell', 'pidof', 'art.splotch.app'])).toString().trim();
  assert.match(pidText, /^\d+$/, 'L0_ANDROID_OWNED_SINGLE_PID_REQUIRED');
  const pid = Number(pidText);
  assert.equal(pid, context.lease.pid, 'L0_ANDROID_PROCESS_CHANGED');
  const start = await adb(['shell', 'cat', `/proc/${pid}/stat`]);
  assert.equal(
    processStartTicks(start),
    context.lease.processStartTicks,
    'L0_ANDROID_PROCESS_BIRTH_CHANGED'
  );
  const unix = (await adb(['shell', 'cat', '/proc/net/unix'])).toString();
  const socket = `webview_devtools_remote_${pid}`;
  assert.ok(
    unix.split('\n').some((line) => line.trim().endsWith(`@${socket}`)),
    'L0_OWNED_WEBVIEW_SOCKET_MISSING'
  );
  return { socket, provider };
}

export async function androidCommand(context) {
  assert.equal(
    digest(readFileSync(context.lease.adbPath)),
    context.lease.adbSha256,
    'L0_ADB_IDENTITY_CHANGED'
  );
  const adb = (args) => guardedAdbCommand(context, args);
  assert.ok(
    Number.isInteger(context.lease.port) && context.lease.port > 1024 && context.lease.port < 65536,
    'L0_UNUSED_CDP_PORT_REQUIRED'
  );
  let session,
    socket,
    provider,
    forwardAttempted = false;
  const failures = [];
  try {
    ({ socket, provider } = await runtimeIdentity(context, adb));
    const forwards = (await adb(['forward', '--list'])).toString();
    assert.ok(
      !forwards.split('\n').some((line) => line.split(/\s+/)[1] === `tcp:${context.lease.port}`),
      'L0_FOREIGN_ADB_FORWARD_REFUSED'
    );
    forwardAttempted = true;
    await adb(['forward', '--no-rebind', `tcp:${context.lease.port}`, `localabstract:${socket}`]);
    const response = await fetch(`http://127.0.0.1:${context.lease.port}/json`, {
      signal: AbortSignal.timeout(commandRemainingMs(context, COMMAND_DEADLINE_MS)),
    });
    assert.ok(response.ok, 'L0_CDP_TARGET_LIST_FAILED');
    const bytes = Buffer.from(await response.arrayBuffer());
    evidence(context, 'cdp-targets.json.txt', bytes);
    const targets = JSON.parse(bytes);
    const expectedUrl = `https://localhost${FIXTURE_PATH}`;
    const matches = targets.filter(
      (target) => target.type === 'page' && target.url === expectedUrl
    );
    assert.equal(matches.length, 1, 'L0_EXACT_FIXTURE_TARGET_REQUIRED');
    const url = new URL(matches[0].webSocketDebuggerUrl);
    assert.equal(url.protocol, 'ws:', 'L0_CDP_PROTOCOL_INVALID');
    assert.ok(
      ['127.0.0.1', 'localhost'].includes(url.hostname) && Number(url.port) === context.lease.port,
      'L0_CDP_ENDPOINT_INVALID'
    );
    session = await connectFixtureSession(context, url.href);
    const browser = await session.browserVersion();
    verifyChromiumProvider(provider, browser);
    evidence(context, 'chromium-provider.json.txt', JSON.stringify({ provider, browser }, null, 2));
    const deadline = Date.now() + commandRemainingMs(context, PAGE_DEADLINE_MS);
    while (!(await session.evaluate('Boolean(window.__SPLOTCH_L0__?.ready)'))) {
      assert.ok(Date.now() < deadline, 'L0_PAGE_READY_DEADLINE');
      await delay(POLL_INTERVAL_MS);
    }
    const run = async (command, name) => {
      const expression = fixtureCommandExpression(command, context.nonce);
      const text = await session.evaluate(expression);
      assert.equal(typeof text, 'string', 'L0_PAGE_RETURN_ENCODING_INVALID');
      const bytes = evidence(context, name, text);
      const value = JSON.parse(bytes);
      verifyPageReport(value, { ...context, command });
      return value;
    };
    await run('raw', 'raw-preimage.json.txt');
    await run(context.command, 'command-result.json.txt');
    assert.equal(
      processStartTicks(await adb(['shell', 'cat', `/proc/${context.lease.pid}/stat`])),
      context.lease.processStartTicks,
      'L0_ANDROID_PROCESS_CHANGED_DURING_COMMAND'
    );
  } catch (error) {
    failures.push(error);
  } finally {
    beginCommandCleanup(context);
    try {
      await closeConnections(context);
    } catch (error) {
      failures.push(error);
    }
    if (forwardAttempted) {
      try {
        await adb(['logcat', '-d', '-v', 'threadtime', '--pid', String(context.lease.pid)]);
      } catch (error) {
        failures.push(error);
      }
      try {
        const beforeRemove = (await adb(['forward', '--list'])).toString();
        const mappings = beforeRemove
          .split('\n')
          .map((line) => line.trim().split(/\s+/))
          .filter((fields) => fields[1] === `tcp:${context.lease.port}`);
        if (mappings.length !== 0) {
          assert.ok(
            mappings.length === 1 &&
              mappings[0][0] === context.lease.device &&
              mappings[0][2] === `localabstract:${socket}`,
            'L0_ADB_FORWARD_OWNERSHIP_CHANGED_RETAINED'
          );
          await adb(['forward', '--remove', `tcp:${context.lease.port}`]);
        }
        const after = (await adb(['forward', '--list'])).toString();
        assert.ok(
          !after.split('\n').some((line) => line.split(/\s+/)[1] === `tcp:${context.lease.port}`),
          'L0_OWNED_FORWARD_REMAINS'
        );
      } catch (error) {
        failures.push(error);
      }
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length) throw new AggregateError(failures, 'L0_ANDROID_COMMAND_AND_CLEANUP_FAILED');
}
