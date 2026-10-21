import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { format } from 'prettier';

const out = resolve('docs/scratchpad/2026-10-21-rn-bug-hunt-web');
const evidence = join(out, 'evidence/run4');
writeFileSync(
  join(evidence, 'verification.json'),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      passed: false,
      status: 'verification running; final receipt replaces this only after all assertions pass',
    },
    null,
    2
  ) + '\n'
);
const json = (name) => JSON.parse(readFileSync(join(evidence, name), 'utf8'));
const lines = (name) =>
  readFileSync(join(evidence, name), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const latest = (rows, key = (row) => row.id) => [
  ...new Map(rows.map((row) => [key(row), row])).values(),
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const build = json('build-and-ownership.json');
assert.equal(git('rev-parse', 'HEAD'), build.head);
const scope = git('diff', '--name-only').split('\n').filter(Boolean);
assert(
  scope.every(
    (file) =>
      file.startsWith('docs/scratchpad/2026-10-21-rn-bug-hunt-web/') ||
      file === 'tools/migration/tests/rsd-native-web-feedback-page.test.mjs'
  )
);
for (const [file, receipt] of Object.entries(build.site.files))
  assert.equal(
    hash(readFileSync(`experiments/native-architecture/dist/web/${file}`)),
    receipt.sha256,
    file
  );
for (const [file, receipt] of Object.entries(build.shipping.prerendered))
  assert.equal(hash(readFileSync(join(build.shipping.artifactRoot, file))), receipt.sha256, file);
assert.equal(
  hash(readFileSync(build.shipping.serverEntry.path)),
  build.shipping.serverEntry.sha256
);

let coloringFiles = 0;
function checkColoring(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) checkColoring(file);
    else {
      const relative = file.slice('web/static/'.length);
      assert.equal(
        hash(readFileSync(file)),
        hash(readFileSync(join('experiments/native-architecture/dist/web', relative))),
        relative
      );
      coloringFiles++;
    }
  }
}
checkColoring('web/static/coloring');

const pageRows = latest(lines('pages-observations.jsonl'));
const main = pageRows.filter((row) => row.take === 'matrix');
const normal = pageRows.filter((row) => row.take === 'normal');
const forcedDark = pageRows.filter((row) => row.take === 'forced-dark');
const short = pageRows.filter(
  (row) => (row.take === 'short' && row.engine !== 'firefox') || row.take === 'short-ready'
);
assert.equal(main.length, 720);
assert.equal(normal.length, 120);
assert.equal(forcedDark.length, 240);
assert.equal(short.length, 180);
const accepted = [...main, ...normal, ...forcedDark, ...short];
for (const row of accepted) {
  assert.deepEqual(row.errors, [], row.id);
  assert.deepEqual(row.external, [], row.id);
  assert.deepEqual(row.csp, [], row.id);
  if (row.status !== 'PASS') {
    assert.equal(row.status, 'REVIEW');
    assert.equal(row.path, '/admin');
    assert.equal(row.profile, 'narrow');
    assert.deepEqual(row.layoutProblems, ['Document scroll width 323px at 320px viewport']);
  }
  const name =
    row.path === '/'
      ? 'index'
      : row.path.startsWith('/run4-unknown')
        ? '404'
        : row.path.slice(1).split('?')[0];
  assert.equal(row.documentSha256, build.site.files[`${name}.html`].sha256, row.id);
  for (const request of row.network)
    assert(['http://127.0.0.1:6150', 'null'].includes(new URL(request.url).origin), request.url);
}
assert.equal(main.filter((row) => row.status === 'PASS').length, 702);
assert.equal(main.filter((row) => row.form?.reset).length, 36);
assert.equal(main.filter((row) => row.admin?.signedOut).length, 36);
assert.equal(accepted.filter((row) => row.status === 'REVIEW').length, 27);
assert.equal(main.filter((row) => row.initial.media.forcedColors).length, 240);

const ai = json('ai-accepted.json');
assert.equal(ai.length, 39);
for (const row of ai) {
  assert.equal(row.status, 'PASS');
  assert.deepEqual(row.errors, []);
  assert.deepEqual(row.external, []);
  assert(existsSync(join(out, row.evidence)), row.evidence);
}
const engines = ['chromium', 'webkit', 'firefox'];
for (const engine of engines) {
  assert.equal(ai.filter((row) => row.engine === engine).length, 13);
  const wire = json(`ai-wire-${engine}.json`);
  assert.equal(wire.pass, true);
  assert.equal(wire.serverStopped, true);
  assert.deepEqual(wire.external, []);
  assert.equal(wire.wire.length, 1);
  assert.equal(wire.wire[0].width, 780);
  assert.equal(wire.wire[0].height, 1538);
  assert(wire.wire[0].bytes > 0);
}
const links = latest(lines('local-links.jsonl'), (row) =>
  [row.engine, row.profile, row.js, row.source].join('|')
);
assert.equal(links.length, 168);
assert.equal(links.filter((row) => row.status === 'PASS').length, 120);
assert.equal(links.filter((row) => row.status === 'KNOWN_WEB003').length, 48);
for (const row of links) {
  assert.deepEqual(row.errors, []);
  assert.deepEqual(row.external, []);
}
const keyboard = latest(lines('keyboard.jsonl'));
assert.equal(keyboard.length, 72);
assert(keyboard.every((row) => row.status === 'PASS'));
const beta = latest(lines('beta-details.jsonl'));
assert.equal(beta.length, 48);
assert(beta.every((row) => row.status === 'PASS'));
const themes = latest(lines('saved-themes.jsonl'), (row) =>
  [row.engine, row.repeat, row.desired, row.path].join('|')
);
assert.equal(themes.length, 84);
assert(themes.every((row) => row.status === 'PASS'));
const aliases = lines('file-aliases.jsonl');
assert.equal(aliases.length, 48);
assert(aliases.every((row) => row.status === 'PASS' && row.http === 200));
const worker = lines('worker-pages.jsonl').filter((row) => row.take === 'settled');
assert.equal(worker.length, 24);
assert(worker.every((row) => row.match && row.actual === row.expected));
assert.equal(worker.filter((row) => row.status === 404).length, 3);
for (const row of lines('worker-completions.jsonl').filter((row) => row.take === 'settled')) {
  assert.deepEqual(row.errors, []);
  assert.deepEqual(row.external, []);
  assert.deepEqual(
    row.consoleErrors.filter((event) => !/^Failed to load resource:.*404/.test(event.text)),
    []
  );
}
const anchorSweeps = latest(lines('anchor-observations.jsonl'));
const keyboardSweeps = anchorSweeps.filter((row) => row.take === 'keyboard');
assert.equal(keyboardSweeps.length, 3);
assert(keyboardSweeps.every((row) => row.status === 'PASS' && row.followed.length === 23));

const findings = readFileSync(join(out, 'findings.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .map(JSON.parse);
assert.equal(new Set(findings.map((row) => row.id)).size, findings.length);
for (const finding of findings) {
  assert.equal(finding.reproducedTwice, true);
  for (const file of finding.evidence) assert(statSync(join(out, file)).isFile(), file);
}
assert.equal(findings.filter((finding) => !finding.run4Verification).length, 4);
assert(
  findings
    .filter((finding) => finding.run4Verification)
    .every((finding) => finding.run4Verification.status === 'fixed')
);

let markdownTargets = 0;
const markdown = [
  'summary.md',
  'summary-run3.md',
  'README.md',
  'plan.md',
  'status.md',
  'results/pages.md',
  'results/ai-run4.md',
  'results/coverage-scope.md',
  ...engines.map((engine) => `results/web-${engine}.md`),
];
for (const file of markdown) {
  const path = join(out, file);
  const prose = readFileSync(path, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const match of prose.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const href = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!href || /^(https?:|mailto:|plugin:|app:)/.test(href)) continue;
    assert(existsSync(resolve(dirname(path), decodeURIComponent(href))), `${file}: ${href}`);
    markdownTargets++;
  }
}
const cleanup = json('cleanup.json');
assert(cleanup.orchestratorUntouched);
assert(cleanup.ports.every((row) => row.listening === (row.port === 6190)));
const receipt = {
  at: new Date().toISOString(),
  head: build.head,
  passed: true,
  productSourceUnchanged: true,
  main: {
    combinations: main.length,
    clean: 702,
    adminWidthFlags: 18,
    httpRequests: main.flatMap((row) => row.network).filter((row) => row.url.startsWith('http'))
      .length,
  },
  supplements: { combinations: 540, clean: 531, adminWidthFlags: 9 },
  aiUnits: 39,
  formerlyBlockedResolved: 18,
  actualWireGenerations: 3,
  localLinkSources: 168,
  localLinkClean: 120,
  localLinkKnownWeb003: 48,
  keyboard: 72,
  betaDetails: 48,
  savedThemeVisits: 84,
  fileAliases: 48,
  workerDocuments: 24,
  keyboardDesignSweeps: 3,
  exportedColoringFilesMatched: coloringFiles,
  newFindings: 4,
  markdownTargets,
  changedTrackedFiles: scope,
  limits:
    'Latest accepted takes; raw stress/isolated failed observations remain. No assertion that every historical take is clean.',
};
writeFileSync(
  join(evidence, 'verification.json'),
  await format(JSON.stringify(receipt), { parser: 'json' })
);
console.log(JSON.stringify(receipt));
