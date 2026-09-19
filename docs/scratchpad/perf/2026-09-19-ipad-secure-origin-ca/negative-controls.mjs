// Offline negative controls for check.mjs. Each mutation alters one packaged run in a scratch
// copy, REFRESHES its manifest hash, and must still fail the content check it targets.
//   node docs/scratchpad/perf/2026-09-19-ipad-secure-origin-ca/negative-controls.mjs
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
const SRC = 'docs/scratchpad/perf/2026-09-19-ipad-secure-origin-ca';
const MUTATIONS = {
  'n1 wrong URL': ['n1-ipad-lan-http-negative', (a) => { a.appUrl = 'https://unrelated.example/'; }],
  'n1 empty entries': ['n1-ipad-lan-http-negative', (a) => { a.pageEntries = []; }],
  'c1 raw frames: repeat 4 max 38 -> 30': ['c1-ipad-ca-ai-waiting', (a) => {
    const s = a.samples.find((x) => x.label === 'show AI waiting print' && x.repeat === 4);
    s.postActionFrameGapsMs = s.postActionFrameGapsMs.map((g) => Math.min(g, 30));
  }],
};
for (const [name, [run, mutate]] of Object.entries(MUTATIONS)) {
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
  rmSync(dir, { recursive: true, force: true });
}
