import { spawn } from 'node:child_process';
import { openSync, closeSync, appendFileSync, writeFileSync } from 'node:fs';

const BROWSER_JOB_TIMEOUT_MS = 1_200_000;
const STATUS_HEARTBEAT_MS = 900_000;

const out = 'docs/scratchpad/2026-10-21-rn-bug-hunt-web';
const engines = ['chromium', 'webkit', 'firefox'];
const jobs = [
  ...engines.map((engine) => [
    `file-aliases-${engine}`,
    'page-file-aliases-run4',
    { HUNT_ENGINE: engine },
  ]),
  ...engines.map((engine) => [
    `local-links-hydrated-${engine}`,
    'page-local-links-run4',
    {
      HUNT_ENGINE: engine,
      HUNT_JS: 'on',
      HUNT_TAKE: 'hydrated',
      HUNT_TRACE_NAV: '1',
      HUNT_SETTLE_HYDRATION: '1',
    },
  ]),
  ...engines.map((engine) => [
    `anchors-keyboard-${engine}`,
    'page-anchors-run4',
    {
      HUNT_ENGINE: engine,
      HUNT_PROFILES: 'desktop',
      HUNT_JS: 'off',
      HUNT_PAGES: 'design',
      HUNT_LINK_MODE: 'keyboard',
      HUNT_TAKE: 'keyboard',
    },
  ]),
  ...engines.map((engine) => [`keyboard-${engine}`, 'page-keyboard-run4', { HUNT_ENGINE: engine }]),
  [
    'short-firefox-ready-recheck',
    'pages-run4',
    {
      HUNT_ENGINE: 'firefox',
      HUNT_TAKE: 'short-ready',
      HUNT_PROFILES: 'short',
      HUNT_TRACE_NAV: '1',
    },
  ],
  ...engines.map((engine) => [
    `web006-minimal-${engine}`,
    'web-006-design-sidebar',
    { HUNT_ENGINE: engine },
    1,
  ]),
  ...engines.map((engine) => [
    `worker-settled-${engine}`,
    'pages-worker-run4',
    { HUNT_ENGINE: engine, HUNT_TAKE: 'settled' },
  ]),
  ...engines.flatMap((engine) => [
    [`web004-minimal-${engine}`, 'web-004-admin-width', { HUNT_ENGINE: engine }, 1],
    [`web005-minimal-${engine}`, 'web-005-static-segment', { HUNT_ENGINE: engine }, 1],
  ]),
  ...engines.map((engine) => [
    `short-pages-${engine}`,
    'pages-run4',
    { HUNT_ENGINE: engine, HUNT_TAKE: 'short', HUNT_PROFILES: 'short', HUNT_MOBILE: '1' },
  ]),
  [
    'reference-firefox-fonts-only',
    'page-deep-links-run4',
    { HUNT_ENGINE: 'firefox', HUNT_ARM: 'shipping', HUNT_BASE: 'http://127.0.0.1:6151' },
  ],
  [
    'anchors-chromium-hydration-corrected',
    'page-anchors-run4',
    { HUNT_ENGINE: 'chromium', HUNT_JS: 'on' },
  ],
  ...engines.map((engine) => [
    `admin-rn-${engine}`,
    'page-admin-review-run4',
    { HUNT_ENGINE: engine },
  ]),
  ...engines.map((engine) => [
    `admin-shipping-${engine}`,
    'page-admin-review-run4',
    { HUNT_ENGINE: engine, HUNT_ARM: 'shipping', HUNT_BASE: 'http://127.0.0.1:6151' },
  ]),
  ...engines.map((engine) => [
    `sidebar-rn-${engine}`,
    'page-design-sidebar-run4',
    { HUNT_ENGINE: engine },
  ]),
  ...engines.map((engine) => [
    `sidebar-shipping-${engine}`,
    'page-design-sidebar-run4',
    { HUNT_ENGINE: engine, HUNT_ARM: 'shipping', HUNT_BASE: 'http://127.0.0.1:6151' },
  ]),
  ...engines.map((engine) => [
    `segments-rn-${engine}`,
    'page-design-segment-run4',
    { HUNT_ENGINE: engine },
  ]),
  ...engines.map((engine) => [
    `segments-shipping-${engine}`,
    'page-design-segment-run4',
    { HUNT_ENGINE: engine, HUNT_ARM: 'shipping', HUNT_BASE: 'http://127.0.0.1:6151' },
  ]),
  ...engines.map((engine) => [
    `normal-motion-${engine}`,
    'pages-run4',
    {
      HUNT_ENGINE: engine,
      HUNT_TAKE: 'normal',
      HUNT_JS: 'on',
      HUNT_SCHEMES: 'light',
      HUNT_MOTION: 'no-preference',
      HUNT_MOBILE: '1',
    },
  ]),
  ...engines.map((engine) => [`ai-wire-${engine}`, 'ai-wire-run4', { HUNT_ENGINE: engine }]),
  ...engines.map((engine) => [
    `forced-dark-${engine}`,
    'pages-run4',
    { HUNT_ENGINE: engine, HUNT_TAKE: 'forced-dark', HUNT_SCHEMES: 'forcedDark', HUNT_MOBILE: '1' },
  ]),
  ...engines.map((engine) => [
    `saved-themes-${engine}`,
    'page-saved-theme-run4',
    { HUNT_ENGINE: engine },
  ]),
  ...engines.map((engine) => [
    `worker-pages-${engine}`,
    'pages-worker-run4',
    { HUNT_ENGINE: engine },
  ]),
  ...engines.map((engine) => [
    `beta-details-${engine}`,
    'page-beta-details-run4',
    { HUNT_ENGINE: engine },
  ]),
  ...engines.map((engine) => [
    `local-links-${engine}`,
    'page-local-links-run4',
    { HUNT_ENGINE: engine },
  ]),
  ...engines.map((engine) => [
    `web003-minimal-${engine}`,
    'web-003-deep-links',
    { HUNT_ENGINE: engine },
    1,
  ]),
];
const results = [];
for (const [name, script, env, expectedExit = 0] of jobs.filter(
  ([name]) => !process.env.HUNT_JOBS || process.env.HUNT_JOBS.split(',').includes(name)
)) {
  const at = new Date().toISOString();
  appendFileSync(
    `${out}/status.md`,
    `\n- ${at} — RUN 4 EXTRA START ${name}; one connected browser, local fixtures only.\n`
  );
  const fd = openSync(`${out}/evidence/run4/${name}.log.txt`, 'w');
  const child = spawn(
    process.execPath,
    [
      '--experimental-strip-types',
      '--disable-warning=ExperimentalWarning',
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      `${out}/repro/${script}.mjs`,
    ],
    { env: { ...process.env, ...env }, stdio: ['ignore', fd, fd] }
  );
  const heartbeat = setInterval(
    () =>
      appendFileSync(
        `${out}/status.md`,
        `\n- ${new Date().toISOString()} — RUN 4 EXTRA ${name} active; completed cases are in its JSONL ledger.\n`
      ),
    STATUS_HEARTBEAT_MS
  );
  const timeout = setTimeout(() => child.kill('SIGINT'), BROWSER_JOB_TIMEOUT_MS);
  const code = await new Promise((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  clearInterval(heartbeat);
  clearTimeout(timeout);
  closeSync(fd);
  const result = {
    name,
    at,
    finished: new Date().toISOString(),
    code,
    expectedExit,
    log: `evidence/run4/${name}.log.txt`,
  };
  results.push(result);
  writeFileSync(
    `${out}/evidence/run4/${process.env.HUNT_RECEIPT ?? (process.env.HUNT_JOBS ? 'extra-selected-jobs' : 'extra-jobs')}.json`,
    JSON.stringify(results, null, 2) + '\n'
  );
  appendFileSync(
    `${out}/status.md`,
    `\n- ${result.finished} — RUN 4 EXTRA END ${name}: exit ${code}, expected ${expectedExit}; per-case assertions remain separate.\n`
  );
  console.log(JSON.stringify(result));
}
