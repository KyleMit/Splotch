import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, lstatSync, renameSync } from 'node:fs';
import { relative, join } from 'node:path';

const root = 'docs/scratchpad/2026-10-21-rn-bug-hunt';
const manifestName = 'evidence-manifest.json';
const pendingName = 'evidence-manifest.pending.json';
const active = JSON.parse(readFileSync(`${root}/results/active-runner.json`));
assert.equal(active.state, 'complete', 'Stop the active runner before sealing the evidence');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const ledger = JSON.parse(readFileSync(`${root}/results/android-device-ledger.json`));
assert.equal(commit, ledger.commit);
function filesBelow(directory) {
  return readdirSync(directory)
    .sort()
    .flatMap((name) => {
      const path = join(directory, name),
        stat = lstatSync(path);
      assert.ok(!stat.isSymbolicLink(), `Evidence symlink requires review: ${path}`);
      if (stat.isDirectory()) return filesBelow(path);
      assert.ok(stat.isFile());
      return [path];
    });
}
const paths = filesBelow(root).filter(
  (path) => ![manifestName, pendingName].includes(relative(root, path))
);
let ignored;
try {
  ignored = execFileSync('git', ['check-ignore', '--no-index', '--stdin', '-z'], {
    input: paths.join('\0') + '\0',
    encoding: 'utf8',
  });
} catch (error) {
  assert.equal(error.status, 1);
  ignored = String(error.stdout ?? '');
}
assert.equal(ignored, '', 'Ignored evidence would be lost from a later evidence package');
const files = paths.map((path) => {
  const bytes = readFileSync(path);
  return {
    path: relative(root, path),
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
});
const manifest = {
  generatedAt: new Date().toISOString(),
  candidateCommit: commit,
  selfExcluded: manifestName,
  fileCount: files.length,
  totalBytes: files.reduce((n, file) => n + file.bytes, 0),
  files,
};
writeFileSync(`${root}/${pendingName}`, JSON.stringify(manifest, null, 2) + '\n');
renameSync(`${root}/${pendingName}`, `${root}/${manifestName}`);
for (const file of files) {
  const bytes = readFileSync(`${root}/${file.path}`);
  assert.equal(bytes.length, file.bytes, file.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
}
console.log(
  JSON.stringify({
    fileCount: manifest.fileCount,
    totalBytes: manifest.totalBytes,
    hashesVerified: true,
    ignoredFiles: 0,
    candidateCommit: commit,
  })
);
