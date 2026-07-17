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

export function run(cmd, args = [], { input, cwd = ROOT, echo = true } = {}) {
  if (echo) console.log(`$ ${[cmd, ...args].join(' ')}`);
  const result = spawnSync(cmd, args, {
    cwd,
    input,
    stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

export function sh(command, cwd = ROOT) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, stdio: 'inherit', shell: true });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`exited ${code}: ${command}`))
    );
  });
}

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

export function capture(cmd, args = [], { cwd = ROOT } = {}) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) fail(`${cmd} failed (exit ${result.status})\n${result.stderr ?? ''}`);
  return result.stdout ?? '';
}

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

const maestroDefaultPath = () => join(homedir(), '.maestro', 'bin', 'maestro');

export const maestroPath = () => (hasCommand('maestro') ? 'maestro' : maestroDefaultPath());

export const maestroInstalled = () => hasCommand('maestro') || existsSync(maestroDefaultPath());

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

export const webOnlyBooks = (books) =>
  books.filter((book) => !(book.platforms ?? ['web', 'mobile']).includes('mobile'));
