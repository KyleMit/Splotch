import { spawn } from 'node:child_process';
import { openSync, closeSync, appendFileSync, writeFileSync } from 'node:fs';

const BROWSER_JOB_TIMEOUT_MS = 1_200_000;
const STATUS_HEARTBEAT_MS = 900_000;

const out = 'docs/scratchpad/2026-10-21-rn-bug-hunt-web';
const jobs = [
  ['pages-firefox', 'pages-run4', { HUNT_ENGINE: 'firefox', HUNT_TAKE: 'matrix' }],
  [
    'admin-chromium-recheck',
    'pages-run4',
    { HUNT_ENGINE: 'chromium', HUNT_TAKE: 'matrix', HUNT_PAGES: 'admin' },
  ],
  ...['chromium', 'webkit', 'firefox'].map((engine) => [
    `deep-links-rn-${engine}`,
    'page-deep-links-run4',
    { HUNT_ENGINE: engine },
  ]),
  ...['chromium', 'webkit', 'firefox'].map((engine) => [
    `deep-links-reference-${engine}`,
    'page-deep-links-run4',
    { HUNT_ENGINE: engine, HUNT_ARM: 'shipping', HUNT_BASE: 'http://127.0.0.1:6151' },
  ]),
  ...['chromium', 'webkit', 'firefox'].map((engine) => [
    `anchors-${engine}`,
    'page-anchors-run4',
    { HUNT_ENGINE: engine },
  ]),
];
const results = [];
for (const [name, script, env] of jobs) {
  const at = new Date().toISOString();
  appendFileSync(
    `${out}/status.md`,
    `\n- ${at} — RUN 4 START ${name}. One connected browser at a time; local fixtures and request guards remain active.\n`
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
    {
      env: { ...process.env, ...env },
      stdio: ['ignore', fd, fd],
    }
  );
  const timer = setInterval(
    () =>
      appendFileSync(
        `${out}/status.md`,
        `\n- ${new Date().toISOString()} — RUN 4 ${name} still active; inspect its JSONL for completed cases.\n`
      ),
    STATUS_HEARTBEAT_MS
  );
  const timeout = setTimeout(() => child.kill('SIGINT'), BROWSER_JOB_TIMEOUT_MS);
  const code = await new Promise((resolve, reject) => {
    child.once('exit', resolve);
    child.once('error', reject);
  });
  clearInterval(timer);
  clearTimeout(timeout);
  closeSync(fd);
  const result = {
    name,
    at,
    finished: new Date().toISOString(),
    code,
    log: `evidence/run4/${name}.log.txt`,
  };
  results.push(result);
  writeFileSync(`${out}/evidence/run4/followup-jobs.json`, JSON.stringify(results, null, 2) + '\n');
  appendFileSync(
    `${out}/status.md`,
    `\n- ${result.finished} — RUN 4 END ${name}: process exit ${code}; assertion/observation verdicts are in the separate case ledger.\n`
  );
  console.log(JSON.stringify(result));
}
