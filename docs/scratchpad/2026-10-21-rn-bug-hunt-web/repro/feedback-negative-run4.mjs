import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = resolve('.');
const out = resolve('docs/scratchpad/2026-10-21-rn-bug-hunt-web');
const source = resolve('experiments/native-architecture/src/rsdDrawing/RsdFeedbackPageContent.tsx');
const original = readFileSync(source, 'utf8');
const dir = mkdtempSync(join(out, 'repro', 'feedback-negative-'));
const mutations = [
  {
    name: 'success-view',
    title: 'replaces the delivered page form with its success status and send-another link',
    before: "const sent = useNativeFeedbackState(owner)?.delivery.status === 'success';",
    after: 'const sent = false; useNativeFeedbackState(owner);',
  },
  {
    name: 'send-another',
    title: 'starts a clean page draft when the send-another link is clicked',
    before: 'onClick={owner?.reset}',
    after: 'onClick={() => {}}',
  },
];
try {
  for (const mutation of mutations) {
    assert(original.includes(mutation.before), `Missing mutation anchor: ${mutation.name}`);
    const config = join(dir, `${mutation.name}.config.mjs`);
    writeFileSync(
      config,
      `import config from ${JSON.stringify(join(repo, 'tools/migration/rsd-drawing-vitest.config.mjs'))};
config.plugins = [{name:'qa-copied-source-negative-control',enforce:'pre',transform(code,id){
if(id.split('?')[0]===${JSON.stringify(source)}) return {code:code.replace(${JSON.stringify(mutation.before)},${JSON.stringify(mutation.after)}),map:null};
}}];
export default config;
`
    );
    const result = spawnSync(
      process.execPath,
      [
        join(repo, 'node_modules/vitest/vitest.mjs'),
        'run',
        '--config',
        config,
        'rsd-native-web-feedback-page.test.mjs',
        '-t',
        mutation.title,
      ],
      { cwd: repo, encoding: 'utf8' }
    );
    const output = result.stdout + result.stderr;
    writeFileSync(`${out}/evidence/run4/feedback-negative-${mutation.name}.log.txt`, output);
    assert.equal(result.status, 1, `${mutation.name} must fail`);
    assert(output.includes('AssertionError'), `${mutation.name} must reach an assertion`);
    assert(output.includes(mutation.title), `${mutation.name} must execute the named test`);
    console.log(`${mutation.name}: intended assertion fails with the in-memory source mutation`);
  }
  assert.equal(readFileSync(source, 'utf8'), original);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
