import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { digest } from './contract.mjs';
import { isMain, runMain } from '../../lib/proc.mjs';

function fields(value, names) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'L0_GATE_MESSAGE_INVALID');
  assert.equal(
    Object.keys(value).sort().join(','),
    names.sort().join(','),
    'L0_GATE_MESSAGE_INVALID'
  );
}

export function spawnCommandGate(call, onPhase) {
  const path = fileURLToPath(import.meta.url);
  const bytes = readFileSync(path);
  call.gateSource = { path, bytes: bytes.length, sha256: digest(bytes) };
  call.targetObservation =
    'source-bound gate reports spawn PID and terminal result; target full OS argv is unobserved';
  const child = spawn(process.execPath, [path], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    detached: true,
  });
  let phase = 'spawned';
  let terminal;
  let released = false;
  let readyResolve, readyReject, resultResolve, resultReject, faultReject;
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  const result = new Promise((resolve, reject) => {
    resultResolve = resolve;
    resultReject = reject;
  });
  const fault = new Promise((_, reject) => {
    faultReject = reject;
  });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  for (const pending of [ready, result, exited, fault]) pending.catch(() => {});
  call.ownerRole = 'command-gate';
  call.gatePath = path;
  call.gateEvents = [];
  call.pid = child.pid;
  const fail = (error) => {
    call.gateFailures ??= [];
    call.gateFailures.push({ at: new Date().toISOString(), reason: String(error) });
    call.gateFailure ??= String(error);
    readyReject(error);
    resultReject(error);
    faultReject(error);
  };
  child.on('message', (message) => {
    call.gateEvents.push({ at: new Date().toISOString(), message });
    try {
      if (message?.kind === 'ready') {
        fields(message, ['kind']);
        assert.equal(phase, 'spawned', 'L0_GATE_MESSAGE_ORDER_INVALID');
        phase = 'ready';
        onPhase('gate-ready');
        readyResolve();
      } else if (message?.kind === 'started') {
        fields(message, ['kind', 'pid']);
        assert.equal(phase, 'running', 'L0_GATE_MESSAGE_ORDER_INVALID');
        assert.ok(
          Number.isSafeInteger(message.pid) && message.pid > 0,
          'L0_GATE_TARGET_PID_INVALID'
        );
        call.targetPid = message.pid;
        phase = 'started';
        onPhase('target-started');
      } else if (message?.kind === 'exit') {
        fields(message, ['kind', 'pid', 'code', 'signal']);
        assert.equal(phase, 'started', 'L0_GATE_MESSAGE_ORDER_INVALID');
        assert.equal(message.pid, call.targetPid, 'L0_GATE_TARGET_PID_CHANGED');
        assert.ok(
          (Number.isInteger(message.code) && message.code >= 0 && message.signal === null) ||
            (message.code === null && typeof message.signal === 'string'),
          'L0_GATE_TARGET_EXIT_INVALID'
        );
        phase = 'terminal';
        terminal = message;
        onPhase('target-exited');
        resultResolve(message);
      } else if (message?.kind === 'spawn-error') {
        fields(message, ['kind', 'error', 'code']);
        assert.equal(phase, 'running', 'L0_GATE_MESSAGE_ORDER_INVALID');
        assert.equal(typeof message.error, 'string', 'L0_GATE_SPAWN_ERROR_INVALID');
        assert.ok(
          message.code === null || typeof message.code === 'string',
          'L0_GATE_SPAWN_ERROR_INVALID'
        );
        phase = 'terminal';
        terminal = message;
        onPhase('target-spawn-error');
        resultReject(new Error(`L0_TARGET_SPAWN_FAILED: ${message.error}`));
      } else assert.fail('L0_GATE_MESSAGE_INVALID');
    } catch (error) {
      fail(error);
    }
  });
  child.once('error', fail);
  child.once('disconnect', () => {
    if (!released) fail(new Error('L0_GATE_DISCONNECTED'));
  });
  child.once('exit', () => {
    if (!released) fail(new Error('L0_GATE_EXIT_BEFORE_RELEASE'));
  });
  const send = (message) =>
    new Promise((resolve, reject) => {
      child.send(message, (error) => (error ? reject(error) : resolve()));
    });
  try {
    onPhase('gate-spawned');
  } catch (error) {
    fail(error);
  }
  return {
    child,
    ready,
    result,
    fault,
    get terminal() {
      return terminal;
    },
    async start(executable, args) {
      assert.equal(phase, 'ready', 'L0_GATE_START_ORDER_INVALID');
      phase = 'running';
      await send({ kind: 'start', executable, args });
    },
    async release() {
      assert.ok(terminal, 'L0_GATE_RELEASE_BEFORE_RESULT');
      if (!released) {
        released = true;
        await send({ kind: 'release' });
      }
      return exited;
    },
  };
}

export async function runLegacyCommandGate(argv) {
  assert.equal(argv.length, 0, 'L0_GATE_ARGUMENTS_REFUSED');
  assert.equal(typeof process.send, 'function', 'L0_GATE_IPC_REQUIRED');
  let phase = 'blocked';
  const send = (message) =>
    new Promise((resolve, reject) => {
      process.send(message, (error) => (error ? reject(error) : resolve()));
    });
  await new Promise((resolve, reject) => {
    // Keep the stable leader observable for a fresh identity check before any escalation.
    const preserveSignalOwner = () => {};
    process.on('SIGTERM', preserveSignalOwner);
    process.once('disconnect', () => reject(new Error('L0_GATE_PARENT_DISCONNECTED')));
    process.on('message', async (message) => {
      try {
        if (message?.kind === 'release') {
          fields(message, ['kind']);
          assert.equal(phase, 'terminal', 'L0_GATE_RELEASE_BEFORE_RESULT');
          process.removeListener('SIGTERM', preserveSignalOwner);
          process.disconnect();
          resolve();
          return;
        }
        fields(message, ['kind', 'executable', 'args']);
        assert.equal(message.kind, 'start', 'L0_GATE_MESSAGE_INVALID');
        assert.equal(phase, 'blocked', 'L0_GATE_START_ORDER_INVALID');
        assert.ok(
          typeof message.executable === 'string' && message.executable.length > 0,
          'L0_GATE_EXECUTABLE_INVALID'
        );
        assert.ok(
          Array.isArray(message.args) && message.args.every((arg) => typeof arg === 'string'),
          'L0_GATE_ARGS_INVALID'
        );
        phase = 'running';
        const target = spawn(message.executable, message.args, {
          stdio: ['ignore', 'inherit', 'inherit'],
        });
        target.once('error', async (error) => {
          phase = 'terminal';
          try {
            await send({ kind: 'spawn-error', error: String(error), code: error.code ?? null });
          } catch (failure) {
            reject(failure);
          }
        });
        target.once('exit', async (code, signal) => {
          phase = 'terminal';
          try {
            await send({ kind: 'exit', pid: target.pid, code, signal });
          } catch (failure) {
            reject(failure);
          }
        });
        if (target.pid) await send({ kind: 'started', pid: target.pid });
      } catch (error) {
        reject(error);
      }
    });
    send({ kind: 'ready' }).catch(reject);
  });
}

if (isMain(import.meta.url)) runMain(() => runLegacyCommandGate(process.argv.slice(2)));
