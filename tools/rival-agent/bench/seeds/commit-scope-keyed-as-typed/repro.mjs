// Fails when `HEAD` and the commit it names key different reviewers.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const { ledgerKeyFor } = await import(
  pathToFileURL(join(process.cwd(), 'tools/rival-agent/launch.mjs')).href
);
const repoRoot = process.cwd();
const oid = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const key = (commit) =>
  ledgerKeyFor({ repoRoot, rival: 'codex', scope: { kind: 'commit', commit }, branch: 'x' });
if (key('HEAD') !== key(oid)) throw new Error('HEAD and its OID key different reviewers');
