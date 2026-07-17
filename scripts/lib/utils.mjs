// Generic helpers shared by the scripts/ folder. App-specific logic stays in
// the script that owns it; Android tooling paths live in lib/android.mjs and
// Playwright app drivers in lib/app-driver.mjs.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function fail(message) {
  console.error(message);
  process.exit(1);
}

// Commands go through the shell so PATH shims (npm, npx, gh, sdkmanager)
// resolve — which means args that aren't plain words need quoting.
const quoteArg = (arg) => (/^[\w./:=-]+$/.test(arg) ? arg : `"${arg}"`);
const shellJoin = (cmd, args) => [cmd, ...args.map(quoteArg)].join(' ');

// Run a command with live output; exits the script with the command's exit
// code if it fails. Pass `input` to answer interactive prompts.
export function run(cmd, args = [], { input, cwd = ROOT, echo = true } = {}) {
  const full = shellJoin(cmd, args);
  if (echo) console.log(`$ ${full}`);
  const result = spawnSync(full, {
    shell: true,
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

// Run a command and return its stdout; exits the script if it fails.
export function capture(cmd, args = [], { cwd = ROOT } = {}) {
  const result = spawnSync(shellJoin(cmd, args), { shell: true, cwd, encoding: 'utf8' });
  if (result.status !== 0) fail(`${cmd} failed (exit ${result.status})\n${result.stderr ?? ''}`);
  return result.stdout ?? '';
}

// Cloud sessions cache Chromium under PLAYWRIGHT_BROWSERS_PATH, but the pinned
// revision can drift from what playwright-core resolves (e.g. the env installed
// 1223 while this Playwright wants 1228), so `chromium.launch()` fails with
// "Executable doesn't exist". Mirror the self-heal in web/playwright.config.ts:
// if the resolved binary is missing, fall back to any Chromium under the
// browsers path. `PLAYWRIGHT_CHROMIUM` overrides; returning undefined lets
// Playwright use its own (correct) binary. Pass the `chromium` browser type in
// so this module doesn't import @playwright/test for scripts that never use it.
export function chromiumExecutablePath(chromium) {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  try {
    if (existsSync(chromium.executablePath())) return undefined;
  } catch {}
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const builds = readdirSync(base)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
    for (const build of builds) {
      for (const sub of ['chrome-linux', 'chrome-linux64']) {
        const p = join(base, build, sub, 'chrome');
        if (existsSync(p)) return p;
      }
    }
  } catch {}
  return undefined;
}

export const hasCommand = (cmd) => spawnSync('which', [cmd], { stdio: 'ignore' }).status === 0;

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
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z]\w*):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim();
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

// Books whose `platforms` field omits 'mobile' (absent means web + mobile).
// strip-native-assets.mjs deletes these from native builds; check-assets.mjs
// cross-checks this filter against booksForPlatform() in src/lib/state/books.ts.
export const webOnlyBooks = (books) =>
  books.filter((book) => !(book.platforms ?? ['web', 'mobile']).includes('mobile'));
