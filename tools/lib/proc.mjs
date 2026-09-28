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

export function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
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

// The one value-flag grammar the tools/ flag readers share: `--name=value`, with
// the value everything after the first `=`, so `--url=http://h/?a=b` survives
// whole. A bare `--name` — which is also how the space form `--name value`
// arrives — and an empty `--name=` both throw instead of reading as absent,
// because that silent fallback is directional: a bare `--native-app` read as
// absent captured Safari while the artifact reported a WebView runtime. A
// present-or-absent switch is not a value flag; read it with readSwitch.
export function readValueFlag(argv, name) {
  const bare = `--${name}`;
  if (argv.includes(bare)) throw new Error(`${bare} takes a value: write ${bare}=<value>`);
  const prefix = `${bare}=`;
  const value = argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (value === '') throw new Error(`${prefix} is empty: give it a value or leave it out`);
  return value;
}

export function argFlag(name, fallback, argv = process.argv) {
  return parseOrFail(() => readValueFlag(argv, name)) ?? fallback;
}

// The mirror rule for a switch: `--name=true` throws rather than reading as
// absent, which would run without the switch while appearing to accept it.
export function readSwitch(argv, name) {
  const bare = `--${name}`;
  if (argv.some((arg) => arg.startsWith(`${bare}=`))) {
    throw new Error(`${bare} is a switch: write ${bare} with no value`);
  }
  return argv.includes(bare);
}

export function argSwitch(name) {
  return parseOrFail(() => readSwitch(process.argv, name));
}

// argFlag, argNumber and argSwitch read one flag each and ignore the rest, so an entry
// built on them declares its whole flag set here, once, in its isMain branch —
// never inside an exported function another CLI calls in-process, which would
// judge that CLI's argv. A mistyped or unsupported flag then stops the run
// instead of silently running without it.
export function rejectUnknownFlags(known, argv = process.argv.slice(2)) {
  const unknown = argv.filter((arg) => {
    const name = /^--([^=]+)/.exec(arg)?.[1];
    return name && !known.includes(name);
  });
  if (unknown.length) {
    fail(`Unknown flag ${unknown.join(' ')} — known flags: ${[...known].sort().join(', ')}`);
  }
}

// Number() alone reads '' as 0 and accepts `0x10`, `1e3`, and `Infinity`;
// parseInt reads `4junk` as 4. Each is a plausible wrong run rather than an
// error, so a numeric flag value is plain digits, with one decimal point
// allowed only where the rule is not integer-only.
const INTEGER_TEXT = /^-?\d+$/;
const DECIMAL_TEXT = /^-?\d+(\.\d+)?$/;
const MAX_TCP_PORT = 65_535;

// Rules for parseNumberFlag: `integer`, inclusive `min`/`max`, exclusive `above`.
export const POSITIVE_INTEGER = { integer: true, min: 1 };
export const NON_NEGATIVE_INTEGER = { integer: true, min: 0 };
export const POSITIVE_NUMBER = { above: 0 };
export const TCP_PORT = { integer: true, min: 1, max: MAX_TCP_PORT };

function describeNumberRule({ integer = false, min, above, max }) {
  const bounds = [
    min === undefined ? null : `>= ${min}`,
    above === undefined ? null : `> ${above}`,
    max === undefined ? null : `<= ${max}`,
  ].filter(Boolean);
  return [integer ? 'an integer' : 'a number', bounds.join(' and ')].filter(Boolean).join(' ');
}

export function parseNumberFlag(name, raw, rule) {
  const { integer = false, min = -Infinity, above = -Infinity, max = Infinity } = rule;
  const value = (integer ? INTEGER_TEXT : DECIMAL_TEXT).test(raw) ? Number(raw) : Number.NaN;
  // A long enough digit string overflows to Infinity, which every open bound admits.
  const representable = integer ? Number.isSafeInteger(value) : Number.isFinite(value);
  if (!representable || !(value >= min && value > above && value <= max)) {
    throw new Error(`--${name} must be ${describeNumberRule(rule)}, got "${raw}"`);
  }
  return value;
}

export function argNumber(name, fallback, rule, argv = process.argv) {
  const raw = argFlag(name, undefined, argv);
  return raw === undefined ? fallback : parseOrFail(() => parseNumberFlag(name, raw, rule));
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
