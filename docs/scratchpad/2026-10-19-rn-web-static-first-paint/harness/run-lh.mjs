import { fileURLToPath } from 'node:url';
// Lighthouse 13.5 (the repo's pinned devDependency) against a URL, the tools/page-load profiles.
// node run-lh.mjs <url> <outDir> <label> [--samples=3] [--throttle=simulate,provided] [--devices=phone,tablet] [--visits=first,repeat]
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
const require = createRequire(join(REPO, 'package.json'));
const { chromium } = require('playwright');
const LH = join(REPO, 'node_modules/lighthouse/cli/index.js');

const [url, outDir, label, ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(
  rest.map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true'])
);
const samples = Number(opt.samples ?? 3);
const throttles = (opt.throttle ?? 'simulate').split(',');
const devices = (opt.devices ?? 'phone,tablet').split(',');
const visits = (opt.visits ?? 'first,repeat').split(',');
const PROFILES = {
  phone: { width: 412, height: 915, deviceScaleFactor: 2.625 },
  tablet: { width: 1133, height: 744, deviceScaleFactor: 2 },
};
mkdirSync(outDir, { recursive: true });

function lighthouse(profileDir, device, throttle, reportPath, repeat) {
  const p = PROFILES[device];
  const flags = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--user-data-dir=${profileDir}`,
  ].join(' ');
  const args = [
    LH,
    url,
    '--form-factor=mobile',
    '--screenEmulation.mobile',
    `--screenEmulation.width=${p.width}`,
    `--screenEmulation.height=${p.height}`,
    `--screenEmulation.deviceScaleFactor=${p.deviceScaleFactor}`,
    `--throttling-method=${throttle}`,
    '--only-categories=performance',
    '--output=json',
    `--output-path=${reportPath}`,
    `--chrome-path=${chromium.executablePath()}`,
    `--chrome-flags=${flags}`,
    '--quiet',
  ];
  if (repeat) args.push('--disable-storage-reset');
  const r = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    timeout: 180_000,
  });
  if (r.status !== 0) throw new Error(`lighthouse failed: ${r.stderr}`);
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  if (report.runtimeError) throw new Error(report.runtimeError.message);
  const a = report.audits;
  const n = (k) => Math.round(a[k]?.numericValue ?? NaN);
  const breakdown = a['lcp-breakdown-insight']?.details?.items ?? [];
  const lcpEl = breakdown.find((item) => item.type === 'node');
  const phases = Object.fromEntries(
    (breakdown.find((item) => item.type === 'table')?.items ?? []).map((p) => [
      p.subpart,
      Math.round(p.duration),
    ])
  );
  return {
    fcp: n('first-contentful-paint'),
    lcp: n('largest-contentful-paint'),
    tbt: n('total-blocking-time'),
    si: n('speed-index'),
    cls: Number((a['cumulative-layout-shift']?.numericValue ?? NaN).toFixed(3)),
    score: Math.round((report.categories.performance?.score ?? NaN) * 100),
    bytes: n('total-byte-weight'),
    lcpNode: lcpEl ? lcpEl.snippet.slice(0, 90) : null,
    tti: n('interactive'),
    phases,
  };
}

const rows = [];
for (const throttle of throttles)
  for (const device of devices)
    for (const visit of visits)
      for (let s = 1; s <= samples; s++) {
        const profileDir = mkdtempSync(join(tmpdir(), 'lhprof-'));
        const base = join(outDir, `${label}-${throttle}-${device}-${visit}-${s}`);
        try {
          if (visit === 'repeat')
            lighthouse(profileDir, device, throttle, `${base}.prime.json`, false);
          const m = lighthouse(profileDir, device, throttle, `${base}.json`, visit === 'repeat');
          rows.push({ label, throttle, device, visit, sample: s, ...m });
          console.log(JSON.stringify(rows.at(-1)));
        } finally {
          rmSync(profileDir, { recursive: true, force: true });
          rmSync(`${base}.prime.json`, { force: true });
        }
      }
writeFileSync(join(outDir, `${label}.rows.json`), JSON.stringify(rows, null, 1));
const median = (xs) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)];
const groups = {};
for (const r of rows) (groups[`${r.throttle} ${r.device} ${r.visit}`] ??= []).push(r);
console.log(`\n${label}: median of ${samples}`);
console.log('cell | FCP | LCP | TBT | SI | TTI | CLS | bytes | LCP element');
for (const [k, g] of Object.entries(groups))
  console.log(
    `${k} | ${median(g.map((r) => r.fcp))} | ${median(g.map((r) => r.lcp))} | ${median(g.map((r) => r.tbt))} | ${median(g.map((r) => r.si))} | ${median(g.map((r) => r.tti))} | ${median(g.map((r) => r.cls))} | ${median(g.map((r) => r.bytes))} | ${g[0].lcpNode}`
  );
