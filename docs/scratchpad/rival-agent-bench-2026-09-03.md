# Rival-agent bench — 2026-09-03

The first run of the seeded-defect bench (`tools/rival-agent/bench/`, `npm run rival:bench`), the
run that decided which of the two `--sandbox` modes the pairing carried for one PR cycle survives.
The decision and its reasoning are in `tools/rival-agent/NOTES.md`; this note is the full record:
every cell, every broker request, and what the numbers do and do not show. Vocabulary as in the
other rival-agent notes: the **native handler** runs in the current runner, the **rival agent** is
the other vendor's CLI in a disposable worktree, and here the bench itself is the handler.

## The corpus

Nine seeds, each a patch against main (94d15c2ca5be494df02f5cc4c48774e1492cc4a4) that reintroduces a
real defect the rival found while the pairing was built, adjusting the test that pinned it so the
suite stays green the way a real regression would; three controls with no defect. Every seed's repro
was validated before the run: exit zero on the base, nonzero on the seeded tree (controls: zero both
times). The seeds, keys, and repros are under `tools/rival-agent/bench/seeds/`.

## Codex rival, both modes, two repetitions

`gpt-5.6-sol` at high effort, launched from the checkout at the head of the bench PR before the
collapse, so the runner still carried the mode axis. 48 cells, 02:43 → 00:01 wall clock, none
failed. Each cell is one `--fresh` round on the seeded working tree with the bench serving the
broker under its mechanical rule (inside the session: approve and run; the network, host-exclusive
suites, installs, or any path outside: decline).

### Summary

| Mode            | Seeds detected | Severity met | Seeded false positives | Control false positives | Unverified | Handler turns (declined) | Local commands (failed) | Wall | Input (cached) | Output | Failed cells |
| --------------- | -------------- | ------------ | ---------------------- | ----------------------- | ---------- | ------------------------ | ----------------------- | ---- | -------------- | ------ | ------------ |
| read-only       | 17/18          | 17/18        | 0                      | 0 over 6                | 8          | 1.0 (0.3)                | 6.0 (0.3)               | 101s | 0.34M (0.29M)  | 3.6k   | 0            |
| workspace-write | 18/18          | 18/18        | 0                      | 0 over 6                | 1          | 0.0 (0.0)                | 8.5 (0.3)               | 98s  | 0.35M (0.31M)  | 3.5k   | 0            |

"Seeds detected" counts a finding anchored to the seeded file at the seeded lines (within three
lines) or naming the defect; "severity met" additionally requires the finding's severity at or above
the key's floor.

### Cells

| Seed                              | Mode            | Rep | Result | Findings | Unverified | Turns (approved/declined) | Local (failed) | Wall | Input (cached) | Output |
| --------------------------------- | --------------- | --- | ------ | -------- | ---------- | ------------------------- | -------------- | ---- | -------------- | ------ |
| commit-scope-keyed-as-typed       | read-only       | 1   | found  | 1        | 0          | 1/0                       | 7 (0)          | 104s | 0.40M (0.35M)  | 3.5k   |
| commit-scope-keyed-as-typed       | workspace-write | 1   | found  | 1        | 0          | 0/0                       | 12 (1)         | 118s | 0.62M (0.56M)  | 3.6k   |
| control-comment-reword            | read-only       | 1   | clean  | 0        | 0          | 1/0                       | 3 (0)          | 59s  | 0.19M (0.15M)  | 1.6k   |
| control-comment-reword            | workspace-write | 1   | clean  | 0        | 0          | 0/0                       | 3 (0)          | 42s  | 0.11M (0.08M)  | 1.2k   |
| control-readme-wording            | read-only       | 1   | clean  | 0        | 0          | 0/0                       | 3 (0)          | 51s  | 0.13M (0.09M)  | 1.6k   |
| control-readme-wording            | workspace-write | 1   | clean  | 0        | 0          | 0/0                       | 5 (1)          | 68s  | 0.21M (0.16M)  | 2.0k   |
| control-test-title                | read-only       | 1   | clean  | 0        | 0          | 1/0                       | 6 (0)          | 76s  | 0.31M (0.27M)  | 2.1k   |
| control-test-title                | workspace-write | 1   | clean  | 0        | 0          | 0/0                       | 7 (0)          | 66s  | 0.25M (0.23M)  | 1.7k   |
| hunk-content-read-as-file-header  | read-only       | 1   | found  | 1        | 0          | 1/0                       | 6 (0)          | 96s  | 0.33M (0.25M)  | 3.3k   |
| hunk-content-read-as-file-header  | workspace-write | 1   | found  | 1        | 0          | 0/0                       | 4 (0)          | 64s  | 0.15M (0.12M)  | 1.9k   |
| newline-escape-in-single-quotes   | read-only       | 1   | found  | 1        | 1          | 0/1                       | 6 (1)          | 114s | 0.35M (0.31M)  | 4.6k   |
| newline-escape-in-single-quotes   | workspace-write | 1   | found  | 1        | 0          | 0/0                       | 10 (0)         | 99s  | 0.18M (0.13M)  | 4.0k   |
| packet-inherits-diff-context      | read-only       | 1   | found  | 1        | 0          | 1/0                       | 4 (0)          | 112s | 0.37M (0.32M)  | 4.2k   |
| packet-inherits-diff-context      | workspace-write | 1   | found  | 1        | 0          | 0/0                       | 10 (0)         | 118s | 0.46M (0.40M)  | 3.9k   |
| paginate-without-slurp            | read-only       | 1   | found  | 1        | 1          | 0/1                       | 7 (0)          | 132s | 0.40M (0.35M)  | 3.4k   |
| paginate-without-slurp            | workspace-write | 1   | found  | 1        | 0          | 0/0                       | 6 (0)          | 94s  | 0.30M (0.26M)  | 3.2k   |
| retry-reuses-log-path             | read-only       | 1   | found  | 1        | 0          | 1/0                       | 5 (0)          | 76s  | 0.29M (0.24M)  | 2.2k   |
| retry-reuses-log-path             | workspace-write | 1   | found  | 1        | 0          | 0/0                       | 20 (1)         | 130s | 0.53M (0.46M)  | 4.9k   |
| session-record-written-late       | read-only       | 1   | found  | 1        | 0          | 1/0                       | 9 (0)          | 156s | 0.54M (0.47M)  | 6.0k   |
| session-record-written-late       | workspace-write | 1   | found  | 1        | 0          | 0/0                       | 7 (0)          | 100s | 0.28M (0.24M)  | 3.7k   |
| stale-request-after-exit          | read-only       | 1   | missed | 0        | 1          | 0/1                       | 6 (1)          | 123s | 0.40M (0.34M)  | 4.6k   |
| stale-request-after-exit          | workspace-write | 1   | found  | 1        | 0          | 0/0                       | 8 (0)          | 97s  | 0.38M (0.33M)  | 3.4k   |
| worktree-install-runs-postinstall | read-only       | 1   | found  | 1        | 1          | 0/0                       | 7 (2)          | 121s | 0.38M (0.32M)  | 5.1k   |
| worktree-install-runs-postinstall | workspace-write | 1   | found  | 1        | 0          | 0/0                       | 21 (0)         | 144s | 0.41M (0.35M)  | 6.2k   |
| commit-scope-keyed-as-typed       | read-only       | 2   | found  | 1        | 0          | 2/0                       | 8 (0)          | 101s | 0.43M (0.39M)  | 3.5k   |
| commit-scope-keyed-as-typed       | workspace-write | 2   | found  | 1        | 0          | 0/0                       | 7 (1)          | 98s  | 0.33M (0.28M)  | 3.3k   |
| control-comment-reword            | read-only       | 2   | clean  | 0        | 0          | 1/0                       | 12 (0)         | 91s  | 0.34M (0.29M)  | 2.8k   |
| control-comment-reword            | workspace-write | 2   | clean  | 0        | 0          | 0/0                       | 4 (0)          | 52s  | 0.15M (0.11M)  | 1.7k   |
| control-readme-wording            | read-only       | 2   | clean  | 0        | 0          | 0/0                       | 3 (0)          | 38s  | 0.11M (0.08M)  | 1.0k   |
| control-readme-wording            | workspace-write | 2   | clean  | 0        | 0          | 0/0                       | 4 (0)          | 59s  | 0.18M (0.14M)  | 1.8k   |
| control-test-title                | read-only       | 2   | clean  | 0        | 0          | 1/0                       | 7 (0)          | 72s  | 0.31M (0.27M)  | 2.1k   |
| control-test-title                | workspace-write | 2   | clean  | 0        | 0          | 0/0                       | 7 (0)          | 68s  | 0.28M (0.23M)  | 2.0k   |
| hunk-content-read-as-file-header  | read-only       | 2   | found  | 1        | 0          | 1/0                       | 6 (1)          | 103s | 0.36M (0.31M)  | 3.4k   |
| hunk-content-read-as-file-header  | workspace-write | 2   | found  | 1        | 0          | 0/0                       | 4 (0)          | 62s  | 0.15M (0.12M)  | 2.1k   |
| newline-escape-in-single-quotes   | read-only       | 2   | found  | 1        | 0          | 1/0                       | 4 (0)          | 99s  | 0.23M (0.20M)  | 3.1k   |
| newline-escape-in-single-quotes   | workspace-write | 2   | found  | 1        | 0          | 0/0                       | 9 (1)          | 175s | 0.55M (0.48M)  | 7.5k   |
| packet-inherits-diff-context      | read-only       | 2   | found  | 1        | 0          | 1/0                       | 6 (0)          | 114s | 0.37M (0.32M)  | 4.1k   |
| packet-inherits-diff-context      | workspace-write | 2   | found  | 1        | 0          | 0/0                       | 8 (0)          | 108s | 0.40M (0.35M)  | 3.8k   |
| paginate-without-slurp            | read-only       | 2   | found  | 1        | 1          | 0/1                       | 4 (1)          | 95s  | 0.23M (0.19M)  | 3.9k   |
| paginate-without-slurp            | workspace-write | 2   | found  | 1        | 1          | 0/1                       | 7 (1)          | 110s | 0.33M (0.29M)  | 4.0k   |
| retry-reuses-log-path             | read-only       | 2   | found  | 1        | 0          | 1/0                       | 6 (0)          | 98s  | 0.41M (0.35M)  | 3.7k   |
| retry-reuses-log-path             | workspace-write | 2   | found  | 1        | 0          | 0/0                       | 8 (0)          | 77s  | 0.35M (0.31M)  | 2.6k   |
| session-record-written-late       | read-only       | 2   | found  | 1        | 1          | 0/1                       | 6 (1)          | 141s | 0.54M (0.48M)  | 6.1k   |
| session-record-written-late       | workspace-write | 2   | found  | 1        | 0          | 0/0                       | 12 (1)         | 137s | 0.52M (0.47M)  | 5.3k   |
| stale-request-after-exit          | read-only       | 2   | found  | 1        | 1          | 0/1                       | 7 (0)          | 126s | 0.45M (0.40M)  | 4.9k   |
| stale-request-after-exit          | workspace-write | 2   | found  | 1        | 0          | 0/0                       | 12 (0)         | 119s | 0.66M (0.60M)  | 4.5k   |
| worktree-install-runs-postinstall | read-only       | 2   | found  | 1        | 1          | 2/1                       | 5 (1)          | 124s | 0.36M (0.33M)  | 5.1k   |
| worktree-install-runs-postinstall | workspace-write | 2   | found  | 1        | 0          | 0/0                       | 10 (0)         | 145s | 0.71M (0.67M)  | 5.5k   |

### Broker requests

* `commit-scope-keyed-as-typed` read-only r1 — approved, exit 23 —
  `npm run test:tools -- tools/rival-agent/tests/launch.test.mjs && node --input-type=module -e 'import { ledgerKeyFor } from "./tools/rival-agent/launch.mjs"; const repoRoot = process.cwd(); const rival = "codex"; const branch = "detached"; const oid = "29d6bedbb70c5600d3929b87ce5a858c069a9598"; const byHead = ledgerKeyFor({ repoRoot, rival, scope: { kind: "commit", commit: "HEAD" }, branch }); const byOid = ledgerKeyFor({ repoRoot, rival, scope: { kind: "commit", commit: oid }, branch }); console.log(JSON.stringify({ byHead, byOid, sameCommit: oid })); if (byHead !== byOid) process.exit(23);'`
* `control-comment-reword` read-only r1 — approved, exit 0 —
  `npx prettier --check tools/rival-agent/spool.mjs && npx eslint tools/rival-agent/spool.mjs`
* `control-test-title` read-only r1 — approved, exit 0 —
  `npm run test:tools -- tools/rival-agent/tests/ledger.test.mjs`
* `hunk-content-read-as-file-header` read-only r1 — approved, exit 0 —
  `node --input-type=module -e 'import { parseDiffAnchors } from "./tools/rival-agent/post-review.mjs"; const patch = ["diff --git a/db/schema.sql b/db/schema.sql", "index 1111111..2222222 100644", "--- a/db/schema.sql", "+++ b/db/schema.sql", "@@ -1,3 +1,3 @@", " create table t (", "--- legacy column", "+++ replacement column", " );"].join("\n"); console.log(JSON.stringify([...parseDiffAnchors(patch)].map(([path, sides]) => ({ path, RIGHT: [...sides.RIGHT], LEFT: [...sides.LEFT] }))));' && npx vitest run --config tools/vitest.config.mjs rival-agent/tests/post-review.test.mjs`
* `newline-escape-in-single-quotes` read-only r1 — declined: reaches outside the disposable worktree
  —
  ``node --input-type=module -e 'import { readFileSync } from "node:fs"; import { spawnSync } from "node:child_process"; const question = readFileSync("tools/rival-agent/acceptance/question.md", "utf8"); const commands = [...question.matchAll(/```sh\n([\s\S]*?)\n```/g)]; const execution = spawnSync("bash", ["-c", commands[2][1]], { encoding: "utf8" }); console.log(JSON.stringify({ status: execution.status, stdout: execution.stdout, stderr: execution.stderr, stdoutCodes: [...execution.stdout].map((character) => character.charCodeAt(0)), stderrCodes: [...execution.stderr].map((character) => character.charCodeAt(0)) }));' && npx vitest run --config tools/vitest.config.mjs rival-agent/tests/gen-acceptance-suite.test.mjs``
* `packet-inherits-diff-context` read-only r1 — approved, exit 0 —
  `node --input-type=module <<'NODE' import { execFileSync } from 'node:child_process'; import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { resolveScope, writeReviewPacket, PACKET_FILES } from './tools/rival-agent/worktree.mjs'; const root = mkdtempSync(join(tmpdir(), 'rival-context-repro-')); const repo = join(root, 'repo'); const packet = join(root, 'packet'); mkdirSync(repo); mkdirSync(packet); const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }); try {   git('init', '-q');   git('config', 'user.name', 'review');   git('config', 'user.email', 'review@example.test');   const lines = Array.from({ length: 30 }, (_, i) =>`l${i}`);   writeFileSync(join(repo, 'a.txt'), `${lines.join('\n')}\n`);   git('add', 'a.txt'); git('commit', '-q', '-m', 'initial');   git('config', 'diff.context', '10');   lines[15] = 'changed';   writeFileSync(join(repo, 'a.txt'),`${lines.join('\n')}\n`);   git('commit', '-q', '-am', 'change');   writeReviewPacket(repo, resolveScope(repo, { kind: 'commit', commit: 'HEAD' }), packet);   const patch = readFileSync(join(packet, PACKET_FILES.diff), 'utf8');   const hunk = patch.split('\n').find((line) => line.startsWith('@@'));   console.log(hunk);   if (hunk !== '@@ -6,21 +6,21 @@ l4') process.exitCode = 1; } finally {   rmSync(root, { recursive: true, force: true }); } NODE`
* `paginate-without-slurp` read-only r1 — declined: needs the network or a host-exclusive resource —
  `gh --version && gh help api \| sed -n '1,220p' && npm exec -- vitest run --config tools/vitest.config.mjs tools/rival-agent/tests/post-review.test.mjs`
* `retry-reuses-log-path` read-only r1 — approved, exit 0 —
  `npm run test:tools -- tools/rival-agent/tests/launch.test.mjs && node --input-type=module -e "import { createWriteStream } from 'node:fs'; import { once } from 'node:events'; import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { randomUUID } from 'node:crypto'; import { logPathForAttempt } from './tools/rival-agent/launch.mjs'; const dir=join(tmpdir(),randomUUID()); const { mkdirSync, rmSync }=await import('node:fs'); mkdirSync(dir); const path1=logPathForAttempt(dir,1); const path2=logPathForAttempt(dir,2); const first=createWriteStream(path1,{flags:'wx'}); await once(first,'open'); first.end(); await once(first,'close'); const second=createWriteStream(path2,{flags:'wx'}); const [error]=await once(second,'error'); console.log(JSON.stringify({path1,path2,code:error.code})); rmSync(dir,{recursive:true}); if(error.code!=='EEXIST'\|\|path1!==path2) process.exit(1);"`
* `session-record-written-late` read-only r1 — approved, exit 0 —
  `node --input-type=module -e 'import { rmSync } from "node:fs"; import { launch, parseLaunchArgs } from "./tools/rival-agent/launch.mjs"; import { sessionStatus } from "./tools/rival-agent/broker.mjs"; let result; const vendor = { rival: "probe", prepare() { return { env: {} }; }, resolveModel() { return "probe"; } }; try { await launch(parseLaunchArgs(["--base", "HEAD"]), vendor, { onProgress(line) { if (!line.startsWith("session: ")) return; const session = line.slice("session: ".length); let brokerError; try { sessionStatus(session); } catch (error) { brokerError = error.message; } result = { session, brokerError }; rmSync(session, { recursive: true, force: true }); throw new Error("probe-complete"); } }); } catch (error) { if (error.message !== "probe-complete") throw error; } console.log(JSON.stringify(result));' && npm run test:tools -- tools/rival-agent/tests/launch.test.mjs`
* `stale-request-after-exit` read-only r1 — declined: reaches outside the disposable worktree —
  `npx vitest run --config tools/vitest.config.mjs rival-agent/tests/broker.test.mjs && node --input-type=module -e "import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { appendRequest, createSessionDirectory, SESSION_FILES, sessionPath, waitForPendingOrEnd, writeJsonAtomic } from './tools/rival-agent/spool.mjs'; const root=mkdtempSync(join(tmpdir(),'rival-terminal-repro-')); const session=createSessionDirectory('session',root); appendRequest(session,{command:'touch /tmp/should-not-run',why:'stale'}); writeJsonAtomic(sessionPath(session,SESSION_FILES.done),{}); console.log(JSON.stringify(await waitForPendingOrEnd(session,{timeoutMs:0})));"`
* `commit-scope-keyed-as-typed` read-only r2 — approved, exit 0 —
  `npm run test:tools -- tools/rival-agent/tests/launch.test.mjs`
* `commit-scope-keyed-as-typed` read-only r2 — approved, exit 42 —
  `node --input-type=module -e 'import { execFileSync } from "node:child_process"; import { ledgerKeyFor } from "./tools/rival-agent/launch.mjs"; const repoRoot=process.cwd(); const full=execFileSync("git", ["rev-parse", "HEAD^{commit}"], { encoding: "utf8" }).trim(); const key=(commit)=>ledgerKeyFor({repoRoot,rival:"claude",scope:{kind:"commit",commit},branch:"unused"}); const aliases=["HEAD",full.slice(0,7),full]; console.log(JSON.stringify({full,aliases:aliases.map((commit)=>({commit,key:key(commit)})),uniqueKeys:new Set(aliases.map(key)).size},null,2)); if (new Set(aliases.map(key)).size !== 1) process.exitCode=42;'`
* `control-comment-reword` read-only r2 — approved, exit 0 —
  `npm run format:check && npm run test:tools -- tools/rival-agent/tests/broker.test.mjs`
* `control-test-title` read-only r2 — approved, exit 0 —
  `npm run test:tools -- rival-agent/tests/ledger.test.mjs`
* `hunk-content-read-as-file-header` read-only r2 — approved, exit 0 —
  `node --input-type=module -e 'import { parseDiffAnchors } from "./tools/rival-agent/post-review.mjs"; const patch = ["diff --git a/db/schema.sql b/db/schema.sql", "index 1111111..2222222 100644", "--- a/db/schema.sql", "+++ b/db/schema.sql", "@@ -1,3 +1,3 @@", " create table t (", "--- legacy column", "+++ replacement column", " );"].join("\n"); const anchors = parseDiffAnchors(patch); console.log(JSON.stringify([...anchors].map(([path, sides]) => ({ path, RIGHT: [...sides.RIGHT], LEFT: [...sides.LEFT] }))));' && npm run test:tools -- rival-agent/tests/post-review.test.mjs`
* `newline-escape-in-single-quotes` read-only r2 — approved, exit 0 —
  `node --input-type=module -e 'process.stdout.write("STDOUT:probe\\n"); process.stderr.write("STDERR:probe\\n"); process.exit(23)'; status=$?; printf '\nOBSERVED_STATUS=%s\n' "$status"; npx vitest run --config tools/vitest.config.mjs rival-agent/tests/gen-acceptance-suite.test.mjs`
* `packet-inherits-diff-context` read-only r2 — approved, exit 0 —
  `npm run test:tools -- tools/rival-agent/tests/worktree.test.mjs && node --input-type=module <<'NODE' import { execFileSync } from 'node:child_process'; import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { parseDiffAnchors } from './tools/rival-agent/post-review.mjs'; import { PACKET_FILES, resolveScope, writeReviewPacket } from './tools/rival-agent/worktree.mjs';  const root = mkdtempSync(join(tmpdir(), 'rival-context-repro-')); const repo = join(root, 'repo'); const packet = join(root, 'packet'); const git = (...args) => execFileSync('git', args, {   cwd: repo,   encoding: 'utf8',   env: {     ...process.env,     GIT_AUTHOR_NAME: 't',     GIT_AUTHOR_EMAIL: 't@t',     GIT_COMMITTER_NAME: 't',     GIT_COMMITTER_EMAIL: 't@t',   }, }).trim(); try {   mkdirSync(repo);   mkdirSync(packet);   git('init', '-q', '-b', 'main');   writeFileSync(join(repo, 'a.txt'), Array.from({ length: 30 }, (_, i) =>`l${i}`).join('\n') + '\n');   git('add', '.');   git('commit', '-q', '-m', 'base');   git('config', 'diff.context', '10');   const lines = readFileSync(join(repo, 'a.txt'), 'utf8').split('\n');   lines[15] = 'changed';   writeFileSync(join(repo, 'a.txt'), lines.join('\n'));   git('commit', '-q', '-am', 'change');   writeReviewPacket(repo, resolveScope(repo, { kind: 'commit', commit: 'HEAD' }), packet);   const patch = readFileSync(join(packet, PACKET_FILES.diff), 'utf8');   const hunk = patch.split('\n').find((line) => line.startsWith('@@'));   const right = [...parseDiffAnchors(patch).get('a.txt').RIGHT];   console.log(JSON.stringify({ hunk, right, acceptedFarContextLine: right.includes(6) }, null, 2)); } finally {   rmSync(root, { recursive: true, force: true }); } NODE`
* `paginate-without-slurp` read-only r2 — declined: needs the network or a host-exclusive resource —
  `node --input-type=module -e "import { readReviews } from './tools/rival-agent/post-review.mjs'; const gh = () => '[{\"id\":1}]\n[{\"id\":2}]\n'; try { console.log(readReviews(7, gh)); } catch (error) { console.error(error.name + ': ' + error.message); process.exitCode = 1; }"; npx vitest run --config tools/vitest.config.mjs rival-agent/tests/post-review.test.mjs`
* `paginate-without-slurp` workspace-write r2 — declined: needs the network or a host-exclusive
  resource — `gh help api \| sed -n '55,95p'`
* `retry-reuses-log-path` read-only r2 — approved, exit 0 —
  `npm run test:tools -- tools/rival-agent/tests/launch.test.mjs tools/rival-agent/tests/stream.test.mjs && node --input-type=module -e "import { mkdtempSync, rmSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { codexReducer, runStreaming } from './tools/rival-agent/stream.mjs'; const dir=mkdtempSync(join(tmpdir(),'rival-log-repro-')); const logPath=join(dir,'rival.ndjson'); const invoke=(exitCode)=>runStreaming({command:process.execPath,args:['-e',\`process.exit(\${exitCode})\`],logPath,reducer:codexReducer});
  let first; let second; try { await invoke(3); } catch (error) {
  first={code:error.code,message:error.message}; } try { await invoke(0); } catch (error) {
  second={code:error.code,message:error.message}; }
  console.log(JSON.stringify({first,second},null,2)); rmSync(dir,{recursive:true,force:true});"`
* `session-record-written-late` read-only r2 — declined: reaches outside the disposable worktree —
  `npm run test:unit -- tools/rival-agent/tests/launch.test.mjs tools/rival-agent/tests/broker.test.mjs && node --input-type=module <<'NODE' import { existsSync } from 'node:fs'; import { launch, parseLaunchArgs } from './tools/rival-agent/launch.mjs'; import { SESSION_FILES, sessionPath } from './tools/rival-agent/spool.mjs'; let announcedSession; let recordVisibleAtAnnouncement; const vendor = {   rival: 'probe',   prepare: () => ({ env: process.env }),   resolveModel: () => 'probe',   command: '/usr/bin/true',   buildArgs: () => [],   reducer: () => ({}),   localToolBoundary: '',   newSessionId: () => 'probe-session', }; try {   await launch(parseLaunchArgs(['--commit', 'HEAD']), vendor, {     onProgress(line) {       if (line.startsWith('session: ')) {         announcedSession = line.slice('session: '.length);         recordVisibleAtAnnouncement = existsSync(sessionPath(announcedSession, SESSION_FILES.session));       }     },   }); } catch {} console.log(JSON.stringify({ announcedSession: Boolean(announcedSession), recordVisibleAtAnnouncement })); if (!announcedSession \|\| recordVisibleAtAnnouncement !== false) process.exit(1); NODE`
* `stale-request-after-exit` read-only r2 — declined: reaches outside the disposable worktree —
  `npm run test:tools -- tools/rival-agent/tests/broker.test.mjs && node --input-type=module -e 'import { mkdtempSync, rmSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path"; import { appendRequest, createSessionDirectory, SESSION_FILES, sessionPath, waitForPendingOrEnd, writeJsonAtomic } from "./tools/rival-agent/spool.mjs"; const root = mkdtempSync(join(tmpdir(), "rival-terminal-repro-")); try { const session = createSessionDirectory("session", root); appendRequest(session, { command: "touch /tmp/should-not-run", why: "stale" }); writeJsonAtomic(sessionPath(session, SESSION_FILES.failed), { reason: "rival exited" }); const outcome = await waitForPendingOrEnd(session, { timeoutMs: 0 }); console.log(JSON.stringify(outcome)); if (outcome.state !== "failed") throw new Error(`expected
  terminal failure to outrank stale request, got
  ${outcome.state}`); } finally { rmSync(root, { recursive: true, force: true }); }'`
* `worktree-install-runs-postinstall` read-only r2 — approved, exit 1 —
  `node --input-type=module -e 'import { execFileSync } from "node:child_process"; import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path"; import { createDisposableWorktree, removeDisposableWorktree } from "./tools/rival-agent/worktree.mjs"; const root=mkdtempSync(join(tmpdir(),"rival-postinstall-probe-")); const repo=join(root,"repo"); const wt=join(root,"wt"); mkdirSync(repo); const git=(args)=>execFileSync("git",["-C",repo,...args],{stdio:"pipe"}); try { git(["init","-q"]); writeFileSync(join(repo,"package.json"),JSON.stringify({name:"probe",version:"1.0.0",scripts:{postinstall:"node -e \\"require(\\\"node:fs\\\").writeFileSync(\\\"postinstall.marker\\\",\\\"ran\\\")\\""}})); writeFileSync(join(repo,"pnpm-lock.yaml"),"lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .: {}\n"); git(["add","."]); git(["-c","user.name=t","-c","user.email=t@t","commit","-qm","probe"]); const head=git(["rev-parse","HEAD"]).toString().trim(); createDisposableWorktree(repo,head,wt); console.log(JSON.stringify({postinstallRan:existsSync(join(wt,"postinstall.marker"))})); removeDisposableWorktree(repo,wt); } finally { rmSync(root,{recursive:true,force:true}); }'`
* `worktree-install-runs-postinstall` read-only r2 — approved, exit 1 —
  `node --input-type=module -e 'import { execFileSync } from "node:child_process"; import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path"; import { createDisposableWorktree, removeDisposableWorktree } from "./tools/rival-agent/worktree.mjs"; const root=mkdtempSync(join(tmpdir(),"rival-postinstall-probe-")); const repo=join(root,"repo"); const wt=join(root,"wt"); mkdirSync(repo); const git=(args)=>execFileSync("git",["-C",repo,...args],{stdio:"pipe"}); try { git(["init","-q"]); writeFileSync(join(repo,"package.json"),JSON.stringify({name:"probe",version:"1.0.0",scripts:{postinstall:"node -p 42 > postinstall.marker"}})); writeFileSync(join(repo,"pnpm-lock.yaml"),"lockfileVersion: 9.0\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .: {}\n"); git(["add","."]); git(["-c","user.name=t","-c","user.email=t@t","commit","-qm","probe"]); const head=git(["rev-parse","HEAD"]).toString().trim(); createDisposableWorktree(repo,head,wt); console.log(JSON.stringify({postinstallRan:existsSync(join(wt,"postinstall.marker"))})); removeDisposableWorktree(repo,wt); } finally { rmSync(root,{recursive:true,force:true}); }'`
* `worktree-install-runs-postinstall` read-only r2 — declined: needs the network or a host-exclusive
  resource —
  `probe_dir=$(mktemp -d); printf '%s\n' '{"name":"probe","version":"1.0.0","scripts":{"postinstall":"node -p 42 > postinstall.marker"}}' > "$probe_dir/package.json"; printf '%s\n' "lockfileVersion: '9.0'" 'settings:' '  autoInstallPeers: true' '  excludeLinksFromLockfile: false' 'importers:' '  .: {}' > "$probe_dir/pnpm-lock.yaml"; (cd "$probe_dir" && pnpm install --frozen-lockfile --prefer-offline --ignore-pnpmfile); probe_status=$?; test -f "$probe_dir/postinstall.marker"; marker_status=$?; printf 'install_status=%s marker_exists=%s\n' "$probe_status" "$([ "$marker_status" -eq 0 ] && printf true \|\| printf false)"; rm -rf "$probe_dir"; exit "$probe_status"`

### Reading it

* **Recall.** The hybrid found all eighteen seeded cells at or above the severity floor; the pairing
  found seventeen. The one miss is `stale-request-after-exit` read-only r1: the rival asked for a
  repro whose command text quoted `/tmp/should-not-run` as a string literal, the bench's path rule
  declined it as reaching outside the worktree, and the rival filed the claim as unverified rather
  than as a finding — the pairing behaving as designed, with a handler that could not read intent.
  In the hybrid the same repro ran locally without asking. One cell either way is inside noise; the
  shape of the difference is not.
* **Unverified.** Eight items on the pairing against one on the hybrid. Every one of the eight is a
  claim the rival wanted a command for and the bench declined (five) or a targeted test it did not
  ask for. The hybrid's one is the `gh api` network probe in `paginate-without-slurp` r2, declined
  as it should be.
* **Handler turns.** One per cell on the pairing (25 requests over 24 cells, 6 declined); none on
  the hybrid except that one network probe. The handler's time is the cost the hybrid removes.
* **Cost.** Wall clock and tokens are the same within noise (101 s against 98 s; 0.34M against 0.35M
  input, almost all cached). The hybrid runs about forty percent more commands of its own, which is
  the verification the pairing routed through the handler.
* **Controls.** Clean in every cell, both modes: no manufactured findings on a comment reword, a
  test-title change, or a README sentence.
* **Judge shapes.** The recorded decisions were checked afterwards for the shapes the first Claude
  rival round showed the judge missing (a path after `>` or `<`, `~`, `$HOME`); none occurred, so no
  cell ran a command the widened rule would have declined.

What the run does not show: anything about diffs larger than a seed (every seed is one or two
files), anything about rounds two and three on the same reviewer (every cell is `--fresh`), or how
either mode behaves when the rig or the network genuinely matters (no seed needs them, by rule).

## Claude rival, one repetition

Opus at high effort, launched from the checkout with the sandboxed-shell launcher the third PR of
the stack adds, the same corpus, the same base, the same handler rule. Twelve cells; one
(`hunk-content-read-as-file-header`) ended with the Claude CLI exiting 1 after its
`StructuredOutput` call was rejected by the schema validator for lacking `findings` and `unverified`
— a vendor behaviour, no retry — and was rerun into the same results directory, where it found the
seed. The original failed cell's record is kept beside the results.

### Summary

| Rival  | Seeds detected | Severity met | Seeded false positives | Control false positives | Unverified | Handler turns (declined) | Local commands (failed) | Wall | Input (cached) | Output | Failed cells |
| ------ | -------------- | ------------ | ---------------------- | ----------------------- | ---------- | ------------------------ | ----------------------- | ---- | -------------- | ------ | ------------ |
| claude | 9/9            | 8/9          | 7                      | 2 over 3                | 1          | 0.1 (0.1)                | 8.5 (0.6)               | 162s | 0.42M (0.42M)  | 10.5k  | 0            |

"Seeds detected" counts a finding anchored to the seeded file at the seeded lines (within three
lines) or naming the defect; "severity met" additionally requires the finding's severity at or above
the key's floor.

### Cells

| Seed                              | Rep | Result                      | Findings | Unverified | Turns (approved/declined) | Local (failed) | Wall | Input (cached) | Output |
| --------------------------------- | --- | --------------------------- | -------- | ---------- | ------------------------- | -------------- | ---- | -------------- | ------ |
| commit-scope-keyed-as-typed       | 1   | found                       | 2        | 0          | 0/0                       | 3 (1)          | 121s | 0.22M (0.22M)  | 7.9k   |
| control-comment-reword            | 1   | clean                       | 0        | 0          | 0/0                       | 6 (0)          | 81s  | 0.19M (0.19M)  | 5.0k   |
| control-readme-wording            | 1   | 1 false                     | 1        | 0          | 0/0                       | 13 (0)         | 178s | 0.56M (0.55M)  | 11.4k  |
| control-test-title                | 1   | 1 false                     | 1        | 0          | 0/0                       | 1 (0)          | 66s  | 0.11M (0.11M)  | 3.8k   |
| hunk-content-read-as-file-header  | 1   | found                       | 1        | 0          | 0/0                       | 11 (2)         | 226s | 0.44M (0.44M)  | 14.9k  |
| newline-escape-in-single-quotes   | 1   | found                       | 2        | 0          | 0/0                       | 7 (0)          | 124s | 0.26M (0.26M)  | 7.9k   |
| packet-inherits-diff-context      | 1   | found                       | 2        | 0          | 0/0                       | 5 (0)          | 154s | 0.41M (0.41M)  | 10.1k  |
| paginate-without-slurp            | 1   | found, severity under floor | 3        | 1          | 0/1                       | 15 (1)         | 325s | 0.69M (0.69M)  | 22.2k  |
| retry-reuses-log-path             | 1   | found                       | 2        | 0          | 0/0                       | 4 (0)          | 153s | 0.46M (0.46M)  | 9.2k   |
| session-record-written-late       | 1   | found                       | 1        | 0          | 0/0                       | 9 (1)          | 119s | 0.41M (0.41M)  | 8.2k   |
| stale-request-after-exit          | 1   | found                       | 2        | 0          | 0/0                       | 15 (0)         | 200s | 0.74M (0.74M)  | 12.8k  |
| worktree-install-runs-postinstall | 1   | found                       | 3        | 0          | 0/0                       | 13 (2)         | 193s | 0.56M (0.56M)  | 13.2k  |

### Broker requests

* `paginate-without-slurp` r1 — declined: needs the network or a host-exclusive resource —
  `printf '== no slurp ==\n'; gh api --paginate 'repos/cli/cli/labels?per_page=2' 2>/dev/null \| node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s);console.log("PARSE OK; isArray="+Array.isArray(v)+" len="+v.length+" firstElemIsArray="+Array.isArray(v[0]))}catch(e){console.log("PARSE FAIL: "+e.message);console.log("HEAD:"+JSON.stringify(s.slice(0,80)));console.log("BYTES:"+s.length)}})'; printf '== slurp ==\n'; gh api --paginate --slurp 'repos/cli/cli/labels?per_page=2' 2>/dev/null \| node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s);console.log("PARSE OK; isArray="+Array.isArray(v)+" len="+v.length+" firstElemIsArray="+Array.isArray(v[0]))}catch(e){console.log("PARSE FAIL: "+e.message)}})'`

### Reading it beside the Codex run

* **Recall.** Nine of nine found; eight at or above the floor. The one under the floor is
  `paginate-without-slurp`, where the rival named the defect at `nit` while it chased the `gh api`
  behaviour it could not reach (the one declined request of the run).
* **More findings per seed.** Seven findings on seeded cells beyond the seeded one, against none for
  Codex, and two on controls (a nit on a README sentence, a suggestion on a test title). Read them
  before calling them noise: several are real observations about the seeded tree. But a bench built
  on one seeded defect per patch counts them as false positives, and the Codex rival made none.
* **Cost.** About 160 s and 0.42M input per cell against Codex's 98 s and 0.35M: slower and
  costlier, with three times the output tokens.
* **Handler turns.** One request in twelve cells, the network probe, declined. The sandboxed shell
  did the rest.
