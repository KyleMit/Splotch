#!/usr/bin/env node
// Lighthouse page-load audit driver for Splotch.
//
// Runs Lighthouse against a target URL for two form factors (phone portrait,
// tablet landscape) under a fixed "slow device + slow internet" profile
// (simulated Slow 4G + 4x CPU), capturing both a first visit (cold cache) and a
// repeat visit (warm cache primed by the first run). Writes JSON + HTML reports
// and prints a summary table.
//
// Why a driver instead of a raw `npx lighthouse` call: getting headless Chrome
// onto an EXTERNAL https origin from inside a Claude-Code-on-web sandbox needs a
// specific, non-obvious flag set (proxy + MITM-CA trust + TLS 1.2). This encodes
// it once. Off-sandbox (a normal laptop) none of that applies and the script
// runs a plain Lighthouse. See SKILL.md for the full story.
//
// Usage:
//   node .ruler/skills/lighthouse-audit/run-audit.mjs [--url <url>] [--out <dir>]
//        [--device phone|tablet|both] [--visits first|repeat|both]
//
// Defaults: --url https://splotch.art/  --out lighthouse-reports  --device both --visits both

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { platform } from 'node:os';

const args = parseArgs(process.argv.slice(2));
const URL = args.url ?? 'https://splotch.art/';
const OUT = resolve(args.out ?? 'lighthouse-reports');
const DEVICE = args.device ?? 'both';
const VISITS = args.visits ?? 'both';

const DEVICES = {
  phone: { label: 'phone-portrait', w: 412, h: 915, dsf: 2.625 },
  tablet: { label: 'tablet-landscape', w: 1133, h: 744, dsf: 2 },
};
const pickedDevices = DEVICE === 'both' ? ['phone', 'tablet'] : [DEVICE];
const pickedVisits = VISITS === 'both' ? ['first', 'repeat'] : [VISITS];

mkdirSync(OUT, { recursive: true });
const chromePath = resolveChrome();
const sandboxFlags = buildSandboxChromeFlags(URL);

console.log(`Target : ${URL}`);
console.log(`Output : ${OUT}`);
console.log(`Chrome : ${chromePath ?? '(auto-detected by lighthouse)'}`);
console.log(
  sandboxFlags.length
    ? `Sandbox: proxy + TLS-1.2 workaround ACTIVE (${sandboxFlags.length} extra flags)`
    : `Sandbox: none (direct network)`
);
console.log('');

for (const key of pickedDevices) {
  const dev = DEVICES[key];
  const profileDir = join(OUT, `profile-${key}`);
  console.log(`### ${dev.label} (${dev.w}x${dev.h})`);
  for (const visit of pickedVisits) {
    const name = `${dev.label}-${visit}`;
    const isRepeat = visit === 'repeat';
    // Repeat visit needs a primed cache. If the caller only asked for 'repeat',
    // do a silent priming pass first so the numbers mean something.
    if (isRepeat && !pickedVisits.includes('first')) {
      runLighthouse({ name: `${name}-prime`, dev, profileDir, repeat: false, quiet: true });
    }
    const rc = runLighthouse({ name, dev, profileDir, repeat: isRepeat });
    reportLine(name, rc);
  }
  console.log('');
}

printSummary();

// ---------------------------------------------------------------------------

function runLighthouse({ name, dev, profileDir, repeat, quiet }) {
  const chromeFlags = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    ...sandboxFlags,
    `--user-data-dir=${profileDir}`,
  ].join(' ');

  const lhArgs = [
    '--yes',
    'lighthouse@12',
    URL,
    '--form-factor=mobile',
    '--screenEmulation.mobile',
    `--screenEmulation.width=${dev.w}`,
    `--screenEmulation.height=${dev.h}`,
    `--screenEmulation.deviceScaleFactor=${dev.dsf}`,
    '--throttling-method=simulate', // Lighthouse default mobile = Slow 4G + 4x CPU
    '--only-categories=performance,accessibility,best-practices,seo',
    '--output=json',
    '--output=html',
    `--output-path=${join(OUT, name)}`,
    '--quiet',
    // Repeat visit: keep the disk cache the priming pass left behind.
    ...(repeat ? ['--disable-storage-reset'] : []),
    `--chrome-flags=${chromeFlags}`,
  ];

  const env = { ...process.env };
  if (chromePath) env.CHROME_PATH = chromePath;

  const res = spawnSync('npx', lhArgs, {
    env,
    stdio: quiet ? 'ignore' : ['ignore', 'ignore', 'inherit'],
    timeout: 240_000,
  });
  return res.status ?? 1;
}

function reportLine(name, rc) {
  const jsonPath = join(OUT, `${name}.report.json`);
  let err = 'NOJSON';
  try {
    err = JSON.parse(readFileSync(jsonPath, 'utf8')).runtimeError?.code ?? 'ok';
  } catch {
    /* leave NOJSON */
  }
  const ok = err === 'ok';
  console.log(`  ${ok ? '✓' : '✗'} ${name}  (exit=${rc}, runtimeError=${err})`);
}

// The Claude-Code-on-web egress gateway is a TLS-terminating MITM proxy. To reach
// an external https origin, headless Chrome must (1) route through it, (2) trust
// its per-host MITM leaf — which is signed by an Anthropic CA in the bundle, so we
// allowlist those CA public keys via --ignore-certificate-errors-spki-list — and
// (3) speak TLS 1.2, because the gateway RESETS Chrome's TLS 1.3 ClientHello.
// Returns [] when not in the sandbox (no proxy env), so off-cloud runs are clean.
function buildSandboxChromeFlags(url) {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxy || platform() !== 'linux') return [];
  const caBundle = process.env.NODE_EXTRA_CA_CERTS || '/root/.ccr/ca-bundle.crt';
  if (!existsSync(caBundle)) return [];

  const spki = spkiAllowlist(caBundle, url);
  const flags = [`--proxy-server=${proxy}`, '--ssl-version-max=tls1.2'];
  if (spki) flags.push(`--ignore-certificate-errors-spki-list=${spki}`);
  return flags;
}

// Compute base64 SHA-256 SPKI hashes for the proxy's signing CAs (subjects that
// mention Anthropic). Falling back to the whole bundle if none match keeps this
// working if the CA naming changes. Matching any cert in the served chain is
// enough for Chrome to accept the MITM leaf.
function spkiAllowlist(caBundle, url) {
  try {
    const pem = readFileSync(caBundle, 'utf8');
    const certs = pem
      .split(/(?=-----BEGIN CERTIFICATE-----)/)
      .filter((c) => c.includes('CERTIFICATE'));
    const hashes = [];
    for (const cert of certs) {
      const subject = opensslText(['x509', '-noout', '-subject'], cert);
      const anthropic = /anthropic|egress|inspection|ccr/i.test(subject);
      if (!anthropic && certs.length > 8) continue; // filter big system bundle; keep tiny custom ones whole
      const der = openssl(['x509', '-pubkey', '-noout'], cert);
      if (!der) continue;
      const hash = spawnSync(
        'sh',
        [
          '-c',
          'openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl enc -base64',
        ],
        { input: der, encoding: 'utf8' }
      ).stdout?.trim();
      if (hash) hashes.push(hash);
    }
    return hashes.join(',');
  } catch {
    return '';
  }
}

function openssl(subArgs, input) {
  const r = spawnSync('openssl', subArgs, { input, encoding: 'utf8' });
  return r.status === 0 ? r.stdout : '';
}
function opensslText(subArgs, input) {
  return openssl(subArgs, input).trim();
}

function resolveChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH))
    return process.env.CHROME_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (existsSync(root)) {
    const dirs = readdirSync(root)
      .filter((d) => d.startsWith('chromium-') && !d.includes('headless'))
      .sort()
      .reverse();
    for (const d of dirs) {
      const bin = join(root, d, 'chrome-linux64', 'chrome');
      if (existsSync(bin)) return bin;
    }
  }
  return null; // let chrome-launcher find a system install
}

function printSummary() {
  const rows = [];
  for (const f of readdirSync(OUT).filter((f) => f.endsWith('.report.json'))) {
    try {
      const r = JSON.parse(readFileSync(join(OUT, f), 'utf8'));
      if (r.runtimeError) continue;
      const a = r.audits;
      const cat = (k) => (r.categories[k] ? Math.round(r.categories[k].score * 100) : '—');
      const nr = a['network-requests']?.details?.items ?? [];
      const kb = Math.round(nr.reduce((s, i) => s + (i.transferSize || 0), 0) / 1024);
      rows.push([
        f.replace('.report.json', ''),
        cat('performance'),
        cat('accessibility'),
        cat('best-practices'),
        cat('seo'),
        a['first-contentful-paint']?.displayValue ?? '',
        a['largest-contentful-paint']?.displayValue ?? '',
        a['total-blocking-time']?.displayValue ?? '',
        `${kb} KB`,
      ]);
    } catch {
      /* skip */
    }
  }
  if (!rows.length) return;
  console.log('Summary');
  const head = ['run', 'Perf', 'A11y', 'BP', 'SEO', 'FCP', 'LCP', 'TBT', 'Transfer'];
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const fmt = (r) => r.map((c, i) => String(c).padEnd(widths[i])).join('  ');
  console.log('  ' + fmt(head));
  for (const r of rows) console.log('  ' + fmt(r));
  console.log(
    `\nReports written to ${OUT} (JSON + HTML). Do not commit them — attach to the PR instead.`
  );
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) out[a.slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
  }
  return out;
}
