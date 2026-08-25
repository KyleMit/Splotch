// Process and CLI helpers shared by the tools/ folder. App-specific logic
// stays in the script that owns it.

import { spawn, spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Whether the calling module is the entry point — pass it `import.meta.url`.
// Node realpaths a symlinked entry before constructing that URL, so compare physical paths too.
// This lets a script export helpers for tests without running its CLI on import.
export function isMain(url) {
  // `isMain(import.meta)` — the object rather than its url — is the easy slip,
  // and it compares unequal to every href, so the gate it guards silently never
  // fires and the script exits 0 having done nothing. A CLI that quietly does
  // nothing is worse than one that crashes, so the wrong shape throws.
  if (typeof url !== 'string') {
    throw new TypeError(`isMain expects import.meta.url, got ${typeof url}`);
  }
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return pathToFileURL(realpathSync(entry)).href === url;
  } catch {
    return false;
  }
}

export function runMain(main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function fail(message) {
  console.error(message);
  process.exit(1);
}

// Runs an argument parser that reports bad input by throwing — which keeps the
// rejection testable — and turns the throw into the usual one-line exit.
export function parseOrFail(parse) {
  try {
    return parse();
  } catch (err) {
    fail(err.message);
  }
}

export function requireEnv(name, hint) {
  const value = process.env[name];
  if (!value) fail(`Missing ${name}${hint ? ` — ${hint}` : ''}`);
  return value;
}

// Reads `--name=value` ONLY. A bare `--name` is invisible to this and comes back
// as the fallback, so `argFlag('x') !== undefined` is never true for one — use
// `process.argv.includes('--x')` for a boolean flag. Worth stating here because
// the failure is silent and directional: a bare `--native-app` read as absent
// captured Safari while the artifact reported a WebView runtime.
export function argFlag(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

// Run a command with live output; exits the script with the command's exit
// code if it fails. Pass `input` to answer interactive prompts.
export function run(cmd, args = [], { input, cwd = ROOT, echo = true } = {}) {
  if (echo) console.log('$', cmd, ...args);
  const result = spawnSync(cmd, args, {
    cwd,
    input,
    stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
  });
  if (result.error) fail(`Failed to launch ${cmd}: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Run a command line through the shell with live output. Unlike run(), it
// rejects instead of exiting the process, so a caller's finally block (e.g.
// emulator/simulator teardown) still executes after a failure.
export function sh(command, cwd = ROOT) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, stdio: 'inherit', shell: true });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`exited ${code}: ${command}`))
    );
  });
}

// Hand a path or URL to the OS opener (ADR-0017): `open` on macOS, `xdg-open`
// on Linux. Blocking by default (a failure exits the script via run()); pass
// `detached` for a best-effort open that returns false instead of failing.
export function openInOS(target, { detached = false } = {}) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [target]] : ['xdg-open', [target]];
  if (!detached) {
    run(cmd, args);
    return true;
  }
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch {
    return false;
  }
}

export async function pollUntil(callback, timeoutMs, intervalMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await callback();
    if (value) return value;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    await sleep(Math.min(intervalMs, remaining));
  }
}

// Run a command and return its stdout; exits the script if it fails.
export function capture(cmd, args = [], { cwd = ROOT } = {}) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    const reason = result.error ? `: ${result.error.message}` : '';
    fail(`${cmd} failed (exit ${result.status})${reason}\n${result.stderr ?? ''}`);
  }
  return result.stdout ?? '';
}

// capture() for a step that is allowed to fail: reports instead of exiting.
// A best-effort guard wrapped in try/catch around capture() is not best-effort
// at all — fail() is process.exit(1), which no catch intercepts, and that
// combination killed a whole preflight on a bound port while its comment
// promised the opposite.
export function tryCapture(cmd, args = [], { cwd = ROOT } = {}) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.error ? result.error.message : (result.stderr ?? ''),
  };
}

export const hasCommand = (cmd) =>
  spawnSync('sh', ['-c', 'command -v "$1"', 'sh', cmd], { stdio: 'ignore' }).status === 0;

// Filesystem-safe run id: an ISO timestamp with ':' and '.' replaced by '-',
// optionally suffixed with a tag (e.g. OUT_TAG).
export function runId(tag) {
  return new Date().toISOString().replace(/[:.]/g, '-') + (tag ? `-${tag}` : '');
}
