// Generic helpers shared by the scripts/ folder. App-specific logic stays in
// the script that owns it; Android tooling paths live in lib/android.mjs and
// Playwright app drivers in lib/app-driver.mjs.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const isWindows = process.platform === 'win32';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function fail(message) {
  console.error(message);
  process.exit(1);
}

// Commands go through the shell so Windows .cmd/.bat shims (npm, npx, gh,
// sdkmanager) resolve — which means args that aren't plain words need quoting.
const quoteArg = (arg) => (/^[\w./:\\=-]+$/.test(arg) ? arg : `"${arg}"`);
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

// Run a command and return its stdout; exits the script if it fails.
export function capture(cmd, args = [], { cwd = ROOT } = {}) {
  const result = spawnSync(shellJoin(cmd, args), { shell: true, cwd, encoding: 'utf8' });
  if (result.status !== 0) fail(`${cmd} failed (exit ${result.status})\n${result.stderr ?? ''}`);
  return result.stdout ?? '';
}

export const hasCommand = (cmd) =>
  spawnSync(isWindows ? 'where' : 'which', [cmd], { stdio: 'ignore' }).status === 0;

// Prefer Maestro from PATH; fall back to its default install location.
// Shared by the Android and iOS smoke tests.
export const maestroPath = () => {
  if (hasCommand('maestro')) return 'maestro';
  return isWindows
    ? join(process.env.USERPROFILE ?? '', 'maestro', 'bin', 'maestro.bat')
    : join(homedir(), '.maestro', 'bin', 'maestro');
};

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
