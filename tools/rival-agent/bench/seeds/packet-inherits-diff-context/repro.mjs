// Fails when the packet diff follows the repository's diff.context instead of the three lines
// GitHub renders.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { resolveScope, writeReviewPacket, PACKET_FILES } = await import(
  pathToFileURL(join(process.cwd(), 'tools/rival-agent/worktree.mjs')).href
);
const root = mkdtempSync(join(tmpdir(), 'rival-bench-context-'));
const repo = join(root, 'repo');
mkdirSync(repo);
const git = (args) =>
  execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
    },
  });
git(['init', '-q', '-b', 'main']);
git(['config', 'diff.context', '10']);
writeFileSync(join(repo, 'a.txt'), `${Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n')}\n`);
git(['add', 'a.txt']);
git(['commit', '-q', '-m', 'thirty lines']);
const lines = readFileSync(join(repo, 'a.txt'), 'utf8').split('\n');
lines[15] = 'changed';
writeFileSync(join(repo, 'a.txt'), lines.join('\n'));
git(['commit', '-q', '-am', 'one change']);
const packet = join(root, 'packet');
mkdirSync(packet);
writeReviewPacket(repo, resolveScope(repo, { kind: 'commit', commit: 'HEAD' }), packet);
const hunk = readFileSync(join(packet, PACKET_FILES.diff), 'utf8')
  .split('\n')
  .find((line) => line.startsWith('@@'));
if (!/^@@ -13,7 \+13,7 @@/.test(hunk ?? ''))
  throw new Error(`hunk wider than GitHub renders: ${hunk}`);
