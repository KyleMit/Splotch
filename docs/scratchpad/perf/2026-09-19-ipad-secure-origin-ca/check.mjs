// Checks this package's claims and says which tier each is in:
//   machine-checked — re-derived from the packaged artifacts and logs;
//   operator-observed — seen in the session or on the device, not packaged (named in README.md).
//     Each log's final `exit N` line was appended by the operator's shell from $?;
//   unsupported — listed, never asserted.
// Also verifies every file against MANIFEST.json and scans every packaged byte with the repo's
// device-identifier guard. Exits non-zero on any failure.
//   node docs/scratchpad/perf/2026-09-19-ipad-secure-origin-ca/check.mjs
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { aiRunEvidenceProblem } from '../../../../tools/perf/ios/capture-xcuitest-actions.mjs';
import { scanForDeviceIdentifiers } from '../../../../tools/perf/lib/device-identifiers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const failures = [];
const check = (claim, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} machine-checked: ${claim}`);
  if (!ok) failures.push(claim);
};

for (const entry of JSON.parse(readFileSync(join(HERE, 'MANIFEST.json'), 'utf8'))) {
  const bytes = readFileSync(join(HERE, entry.path));
  check(
    `manifest hash ${entry.path}`,
    createHash('sha256').update(bytes).digest('hex') === entry.sha256
  );
  const text = entry.path.endsWith('.gz')
    ? gunzipSync(bytes).toString('utf8')
    : bytes.toString('utf8');
  check(
    `no device identifier, LAN address, host name or tunnel host in ${entry.path}`,
    scanForDeviceIdentifiers(text).length === 0 &&
      !/\b192\.168\.\d+\.\d+\b/.test(text) &&
      !/macbook/i.test(text) &&
      !/[a-z0-9-]+\.trycloudflare\.com/.test(text)
  );
}

const run = (name) => JSON.parse(gunzipSync(readFileSync(join(HERE, 'runs', `${name}.json.gz`))));
const control = (name) => readFileSync(join(HERE, 'controls', name), 'utf8');
const jsonl = (name) => control(name).trim().split('\n').map(JSON.parse);
const AI_LABELS = ['show AI waiting print', 'finish AI waiting print'];
const ENTRY = '/_app/immutable/entry/start.Czt61OiU.js';
const HTTPS_ORIGIN = 'https://<rig-mac>.local:54785';

const c1 = run('c1-ipad-ca-ai-waiting');
check(
  `c1: iPad Safari loaded ${HTTPS_ORIGIN}/ and only the build entry ${ENTRY}`,
  c1.appUrl === `${HTTPS_ORIGIN}/` &&
    c1.transport === 'browser' &&
    c1.pageEntries.length === 1 &&
    c1.pageEntries[0] === ENTRY
);
check(
  'c1: the run was on the iPad, classed as a tablet',
  c1.device.name === 'iPad' && c1.device.id === '[redacted]'
);
check('c1: no blocked coverage', c1.actionPlan?.blocked?.length === 0);
const coversRepeats = (artifact, label) => {
  const samples = artifact.samples.filter((sample) => sample.label === label);
  return (
    samples.map((sample) => sample.repeat).join(',') === '1,2,3,4' &&
    samples.map((sample) => sample.warmup).join(',') === 'true,false,false,false'
  );
};
for (const label of AI_LABELS) {
  check(
    `c1: ${label} ran repeats 1-4, repeat 1 the warmup and 2-4 scored`,
    coversRepeats(c1, label)
  );
}
const evidence = c1.samples
  .filter((sample) => sample.label === 'finish AI waiting print')
  .map((sample) => sample.aiRun);
check(
  'c1: every finish sample carries aiRun evidence the capture accepts',
  evidence.length === 4 && evidence.every((state) => aiRunEvidenceProblem(state) === null)
);
check(
  `c1: every run was a secure context at ${HTTPS_ORIGIN} with randomUUID and SubtleCrypto`,
  evidence.every(
    (state) =>
      state.secureContext === true &&
      state.randomUUID === 'function' &&
      state.subtleCrypto === 'object' &&
      state.origin === HTTPS_ORIGIN
  )
);
check(
  'c1: every run made exactly one request, the generate call the in-page stub answered',
  evidence.every(
    (state) =>
      state.requests === 1 &&
      state.generateCalls === 1 &&
      state.urls.length === 1 &&
      state.urls[0].startsWith('/api/generate-image')
  )
);
const summary = (label) => c1.summaries.find((entry) => entry.label === label);
check(
  'c1: finish AI waiting print passed its frame gates',
  summary('finish AI waiting print').passed === true
);
// Re-derived from the raw per-repeat frame gaps, not taken from the summary.
const GATE_MAX_MS = 33.5;
const showScored = c1.samples.filter(
  (sample) => sample.label === 'show AI waiting print' && !sample.warmup
);
const scoredMaxima = showScored.map((sample) => Math.max(...sample.postActionFrameGapsMs));
const breaches = scoredMaxima.filter((max) => max > GATE_MAX_MS).length;
check(
  `c1: show AI waiting print scored-repeat maxima are ${scoredMaxima.join(', ')} ms; ${breaches} of ${scoredMaxima.length} exceed ${GATE_MAX_MS} ms`,
  scoredMaxima.join(',') === '40,30,38' && breaches === 2
);
check(
  'c1: the summary agrees with the raw samples, and the action FAILED on that confirmed max breach',
  summary('show AI waiting print').passed === false &&
    summary('show AI waiting print').frames.max === Math.max(...scoredMaxima) &&
    summary('show AI waiting print').frames.maxBreachSamples === breaches &&
    c1.passed === false
);
check(
  'c1: the log names only that gate failure, and its wrapper-appended exit line reads 1',
  /Action frame gates failed: show AI waiting print\n[\s\S]*^exit 1$/m.test(
    control('c1-ipad-ca-ai-waiting.log.txt')
  )
);

const n1 = run('n1-ipad-lan-http-negative');
const blocked = JSON.stringify(n1.actionPlan?.blocked ?? []);
const LAN_ORIGIN = 'http://<lan>:54784';
check(
  `n1: the capture loaded ${LAN_ORIGIN}/ and the same build entry ${ENTRY}`,
  n1.appUrl === `${LAN_ORIGIN}/` &&
    n1.pageEntries.length > 0 &&
    n1.pageEntries.every((entry) => entry === ENTRY)
);
check(
  'n1: both AI actions are blocked, no sample was scored, and the capture failed',
  n1.passed === false &&
    n1.samples.length === 0 &&
    n1.actionPlan.blocked.length === AI_LABELS.length &&
    AI_LABELS.every((label) => n1.actionPlan.blocked.some((entry) => entry.label === label))
);
check(
  `n1: each block names the error face at ${LAN_ORIGIN}`,
  n1.actionPlan.blocked.every(
    (entry) =>
      entry.reason.includes('"failedUi":true') &&
      entry.reason.includes(`"origin":"${LAN_ORIGIN}"`)
  )
);
check(
  'n1: and recorded why: not a secure context, no crypto APIs, zero requests',
  /\\"secureContext\\":false/.test(blocked) &&
    /\\"randomUUID\\":\\"undefined\\"/.test(blocked) &&
    /\\"requests\\":0/.test(blocked)
);

const probes = Object.fromEntries(
  jsonl('route-probes-ca2.jsonl.txt').map((probe) => [probe.label, probe])
);
const loadsApp = (probe) =>
  probe.secureContext === true &&
  probe.randomUUID === 'function' &&
  probe.subtle === 'object' &&
  probe.appMounted === true &&
  probe.entry === 'start.Czt61OiU.js';
const refused = (probe) =>
  probe.title === 'This Connection Is Not Private' && probe.appMounted === false;
check(
  'route (two-year root): the leaf loads the app as a secure context by .local name and by address',
  loadsApp(probes['ca2-positive-local']) && loadsApp(probes['ca2-positive-ip'])
);
check(
  'route (two-year root): the iPad refuses a leaf naming example.com beside the permitted address',
  refused(probes['ca2-constraint-probe'])
);
check(
  'route (two-year root): the iPad refuses a leaf from the replaced 30-day root',
  refused(probes['old-ca-leaf'])
);
check(
  'route: plain LAN http loads the same entry without a secure context or crypto APIs',
  probes['lan-http-negative'].secureContext === false &&
    probes['lan-http-negative'].randomUUID === 'undefined' &&
    probes['lan-http-negative'].entry === 'start.Czt61OiU.js'
);

const first = Object.fromEntries(
  jsonl('route-probes-first-ca-and-tunnel.jsonl.txt').map((probe) => [probe.label, probe])
);
check(
  'first root: loaded securely, and refused its constraint probe on the iPad',
  loadsApp(first['ca-positive']) && refused(first['ca-constraint-negative'])
);
check(
  'tunnel: the first hostname failed on the iPad; the second loaded the app as a secure context',
  first['tunnel-positive'].title === 'Can’t Open Page' && loadsApp(first['tunnel2-positive'])
);
const timing = (prefix) =>
  Object.values(first)
    .filter((probe) => probe.label.startsWith(prefix))
    .map((probe) => probe.loadMs);
check(
  'timing: three alternating loads each; every tunnel load was slower than every CA load',
  timing('ca-cmp-').length === 3 &&
    timing('tunnel-cmp-').length === 3 &&
    Math.min(...timing('tunnel-cmp-')) > Math.max(...timing('ca-cmp-'))
);

const codes = (name) =>
  Object.fromEntries(
    control(name)
      .trim()
      .split('\n')
      .map((line) => line.trim().split(/\s+/))
      .map(([method, path, code]) => [`${method} ${path}`, code])
  );
const DENIED = [
  'GET /api/generate-image',
  'POST /api/generate-image',
  'GET /admin',
  'GET /dev/store-frames/identity',
  'POST /',
  'OPTIONS /',
];
for (const name of [
  'front-tls-check.txt',
  'front-local-check.txt',
  'front-public-check-1.txt',
  'front-public-check-2.txt',
]) {
  const result = codes(name);
  check(
    `${name}: the page and its entry are served; server routes and other methods get 403`,
    result['GET /'] === '200' && DENIED.every((request) => result[request] === '403')
  );
}
const tunnelRequests = control('front-tunnel-requests.tsv.txt').trim().split('\n');
check(
  'tunnel front: every denied request in its log is one the checks sent, none the page needed',
  tunnelRequests
    .filter((line) => !line.endsWith('\tallow'))
    .every((line) => /\t\/(api|admin|dev|nonexistent|_app\/\.\.)|\t(POST|PUT|DELETE|OPTIONS)\t/.test(line))
);

const trust = control('mac-trust-checks.txt');
check(
  "macOS trust engine: the two-year root's leaf passes for both names; the probe and an example.com leaf fail",
  /leaf-in for <rig-mac>\.local: \.\.\.certificate verification successful/.test(trust) &&
    /leaf-in for <lan>: \.\.\.certificate verification successful/.test(trust) &&
    /leaf-mixed for <lan>: Cert Verify Result: CSSMERR_TP_INVALID_CERTIFICATE/.test(trust) &&
    /leaf-out-dns for example\.com: Cert Verify Result: CSSMERR_TP_INVALID_CERTIFICATE/.test(trust)
);
check(
  'root: critical name constraints to one .local name and one /32 address, pathlen 0, expiring 2028',
  /Name Constraints: critical\s+Permitted:\s+DNS:<rig-mac>\.local\s+IP:<lan>\/255\.255\.255\.255/.test(
    trust
  ) &&
    /CA:TRUE, pathlen:0/.test(trust) &&
    /notAfter=Sep 18 17:05:23 2028 GMT/.test(trust)
);

check(
  'preflight: Android green; the iPad launch failed on Unknown device UDID with both Appium servers',
  /✓ android input/.test(control('preflight.log.txt')) &&
    /✗ ios launch\s+Unknown device or simulator UDID/.test(control('preflight.log.txt')) &&
    /✗ ios launch\s+Unknown device or simulator UDID/.test(
      control('preflight-ios-fresh-appium.log.txt')
    )
);
check(
  "discovery: the root tunnel's registry lists zero tunnels",
  /"totalTunnels":0/.test(control('discovery.log.txt'))
);
check(
  'grant: WDA timed out enabling automation mode, then came up once the passcode was entered',
  /Timed out while enabling automation mode/.test(control('wda-relaunch-loop.log.txt')) &&
    /WDA READY/.test(control('wda-relaunch-loop.log.txt'))
);

console.log(
  '\noperator-observed (see README): the profile installs, removal of the 30-day root and trust toggles on the iPad; the passcode entry; the unconstrained-root control; the router NXDOMAIN reply; the tunnel returning 530 once stopped'
);
console.log(
  'unsupported: whether the route changes frame timing (the gate failure is unattributed); any historical before/after comparison'
);
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall machine-checked assertions pass');
