// Generic helpers shared by the scripts/ folder. App-specific logic stays in
// the script that owns it; Android tooling paths live in lib/android.mjs and
// Playwright app drivers in lib/app-driver.mjs.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Whether the calling module is the entry point — pass it `import.meta.url`.
// Lets a script export helpers for tests without running its CLI on import.
export const isMain = (url) =>
  Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === url;

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

export function requireEnv(name, hint) {
  const value = process.env[name];
  if (!value) fail(`Missing ${name}${hint ? ` — ${hint}` : ''}`);
  return value;
}

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

// Poll a URL until `ready(res)` (plain HTTP reachability by default) or throw
// at the deadline.
export async function waitForUrl(url, timeoutMs, ready = (res) => res.ok) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (ready(await fetch(url))) return;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  throw new Error(`${url} did not become ready within ${timeoutMs}ms`);
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
  if (result.status !== 0) fail(`${cmd} failed (exit ${result.status})\n${result.stderr ?? ''}`);
  return result.stdout ?? '';
}

// Cloud sessions cache Chromium under PLAYWRIGHT_BROWSERS_PATH, but the pinned
// revision can drift from what playwright-core resolves (e.g. the env installed
// 1223 while this Playwright wants 1228), so `chromium.launch()` fails with
// "Executable doesn't exist". Mirror the self-heal in web/playwright.config.ts:
// if the resolved binary is missing, fall back to any Chromium under the
// browsers path. `PLAYWRIGHT_CHROMIUM` (or its alias `PLAYWRIGHT_CHROMIUM_PATH`)
// overrides; returning undefined lets Playwright use its own (correct) binary.
// Pass the `chromium` browser type in so this module doesn't import
// @playwright/test for scripts that never use it.
export function chromiumExecutablePath(chromium) {
  if (process.env.PLAYWRIGHT_CHROMIUM || process.env.PLAYWRIGHT_CHROMIUM_PATH)
    return process.env.PLAYWRIGHT_CHROMIUM || process.env.PLAYWRIGHT_CHROMIUM_PATH;
  try {
    if (existsSync(chromium.executablePath())) return undefined;
  } catch {}
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const chromiumPrefix = 'chromium-';
  try {
    const builds = readdirSync(base)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort(
        (a, b) => Number(b.slice(chromiumPrefix.length)) - Number(a.slice(chromiumPrefix.length))
      );
    for (const build of builds) {
      for (const sub of ['chrome-linux', 'chrome-linux64']) {
        const p = join(base, build, sub, 'chrome');
        if (existsSync(p)) return p;
      }
    }
  } catch {}
  return undefined;
}

export const hasCommand = (cmd) =>
  spawnSync('sh', ['-c', 'command -v "$1"', 'sh', cmd], { stdio: 'ignore' }).status === 0;

// Maestro's default install location when it isn't on PATH (the curl installer
// drops it in ~/.maestro/bin).
const maestroDefaultPath = () => join(homedir(), '.maestro', 'bin', 'maestro');

// Prefer Maestro from PATH; fall back to its default install location.
// Shared by the Android and iOS smoke tests.
export const maestroPath = () => (hasCommand('maestro') ? 'maestro' : maestroDefaultPath());

// Whether Maestro is usable at all — on PATH or at its default location.
export const maestroInstalled = () => hasCommand('maestro') || existsSync(maestroDefaultPath());

// Split a "---\nkey: value\n---\nbody" document. Returns null if the document
// has no frontmatter block. `frontmatter` is the raw text between the fences;
// `meta` is the parsed key/value pairs (flat — we never need nested YAML).
export function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return null;
  const meta = {};
  for (const [index, line] of match[1].split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const m = line.match(/^([A-Za-z]\w*):\s*(.*)$/);
    if (!m) throw new Error(`Malformed frontmatter line ${index + 1}: ${line}`);
    meta[m[1]] = m[2].trim();
  }
  return { frontmatter: match[1], meta, body: match[2].trim() };
}

export function writeFileDeep(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

export function compareSemverDesc(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pb[i] || 0) !== (pa[i] || 0)) return (pb[i] || 0) - (pa[i] || 0);
  }
  return 0;
}

// Filesystem-safe run id: an ISO timestamp with ':' and '.' replaced by '-',
// optionally suffixed with a tag (e.g. OUT_TAG).
export function runId(tag) {
  return new Date().toISOString().replace(/[:.]/g, '-') + (tag ? `-${tag}` : '');
}
