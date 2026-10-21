import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, relative, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root = resolve('.'),
  out = resolve('docs/scratchpad/2026-10-21-rn-bug-hunt-web'),
  files = [];
function walk(path) {
  for (const e of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, e.name);
    if (e.isDirectory()) walk(full);
    else files.push(full);
  }
}
walk(out);
const readLines = (path) =>
  readFileSync(join(out, path), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const observations = readLines('evidence/observations.jsonl');
for (const row of observations) assert(existsSync(join(out, row.evidence)), row.evidence);
const findings = readLines('findings.jsonl');
assert.equal(new Set(findings.map((f) => f.id)).size, findings.length);
for (const f of findings) {
  assert(f.reproducedTwice);
  for (const p of f.evidence) assert(existsSync(join(out, p)), p);
}
const links = [],
  missing = [];
for (const path of files.filter((p) => p.endsWith('.md'))) {
  const content = readFileSync(path, 'utf8');
  for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '');
    if (/^(?:https?:|mailto:|#|data:)/.test(target)) continue;
    const file = decodeURIComponent(target.split('#')[0]).replace(/:\d+$/, '');
    if (!file) continue;
    const absolute = resolve(dirname(path), file);
    links.push({ source: relative(out, path), target });
    if (!existsSync(absolute)) missing.push({ source: relative(out, path), target });
  }
}
assert.deepEqual(missing, [], 'Broken local Markdown targets');
const diff = spawnSync('git', ['diff', '--name-only'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
});
assert.equal(diff.status, 0, diff.stderr);
const changed = diff.stdout.trim().split('\n').filter(Boolean);
assert(
  changed.every((p) => p === 'tools/tests/native-paper-input-web.test.mjs'),
  JSON.stringify(changed)
);
const ignored = spawnSync('git', ['check-ignore', '--stdin'], {
  cwd: root,
  input: files.map((p) => relative(root, p)).join('\n') + '\n',
  encoding: 'utf8',
  maxBuffer: 10000000,
  env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
});
assert.equal(ignored.status, 1, ignored.stdout + ignored.stderr);
const builds = JSON.parse(readFileSync(join(out, 'evidence/build-run3.json')));
for (const artifact of builds.artifacts) {
  const bytes = readFileSync(resolve(root, artifact.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), artifact.sha256, artifact.path);
}
const visual = JSON.parse(readFileSync(join(out, 'evidence/visual-verification.json')));
assert.equal(visual.verifiedPairs, 1472);
assert.deepEqual(visual.pageErrors, []);
const ledger = JSON.parse(readFileSync(join(out, 'evidence/latest-verdicts.json')));
assert.equal(
  new Set(ledger.map((r) => r.engine + '/' + r.profile + '/' + r.id)).size,
  ledger.length
);
const receipt = {
  at: new Date().toISOString(),
  files: files.length,
  localMarkdownTargets: links.length,
  missingTargets: missing,
  observationScreenshots: observations.length,
  findings: findings.length,
  ignoredArtifacts: [],
  trackedChanges: changed,
  productSourceUnchanged: true,
  buildArtifactHashesMatch: true,
  visualVerifiedPairs: visual.verifiedPairs,
  functionalUnits: ledger.length,
};
writeFileSync(
  join(out, 'evidence/verification-run3.json'),
  JSON.stringify(receipt, null, 2) + '\n'
);
console.log(JSON.stringify(receipt));
