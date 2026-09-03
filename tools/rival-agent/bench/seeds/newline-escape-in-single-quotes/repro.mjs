// Fails when the acceptance template's exit-23 stage prints its markers without the newline the
// question demands: a `\\n` inside shell single quotes reaches Node as two characters.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { generateAcceptanceSuite } = await import(
  pathToFileURL(join(process.cwd(), 'tools/rival-agent/gen-acceptance-suite.mjs')).href
);
const nonce = 'feedfacecafebeef00112233';
const { questionPath } = generateAcceptanceSuite({
  outputDirectory: join(mkdtempSync(join(tmpdir(), 'rival-bench-escape-')), 'suite'),
  nonce,
});
const commands = [...readFileSync(questionPath, 'utf8').matchAll(/```sh\n([\s\S]*?)\n```/g)].map(
  (match) => match[1]
);
const result = spawnSync('bash', ['-c', commands[2]], { cwd: process.cwd(), encoding: 'utf8' });
if (result.status !== 23) throw new Error(`exit ${result.status}`);
if (result.stdout !== `STDOUT:${nonce}\n` || result.stderr !== `STDERR:${nonce}\n`) {
  throw new Error(`markers: ${JSON.stringify({ stdout: result.stdout, stderr: result.stderr })}`);
}
