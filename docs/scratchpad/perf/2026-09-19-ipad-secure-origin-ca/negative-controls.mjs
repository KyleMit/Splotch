// Offline negative controls for check.mjs. Each mutation alters one packaged run in a scratch
// copy, REFRESHES its manifest hash, and must still fail the content check it targets.
//   node docs/scratchpad/perf/2026-09-19-ipad-secure-origin-ca/negative-controls.mjs
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
const SRC = 'docs/scratchpad/perf/2026-09-19-ipad-secure-origin-ca';
// [run, claim prefixes that must FAIL, mutation]
const MUTATIONS = {
  'n1 wrong URL': ['n1-ipad-lan-http-negative', ['n1: the capture loaded'], (a) => { a.appUrl = 'https://unrelated.example/'; }],
  'n1 empty entries': ['n1-ipad-lan-http-negative', ['n1: the capture loaded'], (a) => { a.pageEntries = []; }],
  'c1 raw frames: repeat 4 max 38 -> 30': ['c1-ipad-ca-ai-waiting', ['c1: show AI waiting print scored-repeat maxima', 'c1: the summary agrees with the raw samples'], (a) => {
    const s = a.samples.find((x) => x.label === 'show AI waiting print' && x.repeat === 4);
    s.postActionFrameGapsMs = s.postActionFrameGapsMs.map((g) => Math.min(g, 30));
  }],
};
const problems = [];
for (const [name, [run, expected, mutate]] of Object.entries(MUTATIONS)) {
  const dir = 'docs/scratchpad/perf/zz-mutation-scratch';
  rmSync(dir, { recursive: true, force: true });
  cpSync(SRC, dir, { recursive: true });
  const path = `${dir}/runs/${run}.json.gz`;
  const artifact = JSON.parse(gunzipSync(readFileSync(path)));
  mutate(artifact);
  const bytes = gzipSync(Buffer.from(JSON.stringify(artifact)), { level: 9 });
  writeFileSync(path, bytes);
  const manifest = JSON.parse(readFileSync(`${dir}/MANIFEST.json`));
  manifest.find((e) => e.path === `runs/${run}.json.gz`).sha256 = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(`${dir}/MANIFEST.json`, JSON.stringify(manifest, null, 2));
  const out = spawnSync(process.execPath, [`${dir}/check.mjs`], { encoding: 'utf8' });
  const fails = out.stdout.split('\n').filter((l) => l.startsWith('FAIL'));
  console.log(`\n## ${name}: exit ${out.status}`);
  for (const f of fails) console.log('  ' + f.replace('FAIL machine-checked: ', ''));
  const failed = fails.map((f) => f.replace('FAIL machine-checked: ', ''));
  if (out.status !== 1) problems.push(`${name}: checker exited ${out.status}, expected 1`);
  if (failed.some((claim) => claim.startsWith('manifest hash'))) {
    problems.push(`${name}: the manifest hash failed, so the content check was not isolated`);
  }
  for (const prefix of expected) {
    if (!failed.some((claim) => claim.startsWith(prefix))) {
      problems.push(`${name}: expected a failure starting "${prefix}"`);
    }
  }
  rmSync(dir, { recursive: true, force: true });
}
if (problems.length) {
  console.error(`\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('\nevery mutation failed its targeted check, and only by content');
