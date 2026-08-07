# Audit

> Transient staging for Splotch's audit skills (`.claude/audit-conventions.md`). Producers **merge**
> findings here; `/vet-audits` validates them and files the survivors as `type:audit` GitHub issues,
> then deletes this file. `/fix-audits` burns down those issues. Never treat this file as a
> long-lived backlog.

That last line is the one this file kept failing. The 2026-07-28 comprehensive per-section audit
filed 649 raw findings here and they were worked as a standing backlog for ten days. Successive
burndown campaigns fixed roughly 300, and two `/vet-audits` passes drained the severity head into
issues #774–#785. On 2026-08-07 the remaining 346 were re-triaged against `main` and cut to 75; the
other 271 were deleted outright. The deletion was the point rather than a side effect — the
reasoning is in `docs/AUDIT-LOG.md` under 2026-08-07 · audit-triage, and every deleted finding
remains in this file's git history. The re-pinning below dropped 3 more, leaving the **72** here.

**Citations are pinned to commit f5bf8767 (2026-08-06), the `main` head at the time of the
re-pinning.** They were originally taken at 9ae62ff1 (2026-07-28). Every one of the 277 cited line
numbers was re-derived against f5bf8767 by following the old line through the intervening diffs and
requiring its content to match at the destination, so a citation here identifies the same code the
finding was written about — not the same offset.

Of the 72 findings, 59 re-derived automatically, 12 were re-pinned by hand where the mapping was
ambiguous (a wholesale restructure, or a range endpoint that was itself edited), and one — the
COMPATIBILITY.md register finding — cites a section rather than lines and needs no pin. Three
citations changed file: the `report` endpoint's validation was extracted to
`web/src/lib/server/report.ts`, the README's prerequisites moved to `docs/CONTRIBUTING.md`, and
`spreadTracker.svelte.ts` was renamed to `spreadTracker.ts`.

The 3 findings dropped during the re-pinning were the ones whose citations still resolved but whose
code no longer said what the finding described, because each had been fixed in the meantime:
create-adr's step 4 now reads "do not count files"; `MAX_HOT_RASTERS` no longer exists in the perf
harness; and `scripts/tests/dev-ports.test.mjs` now guards the dev/preview ports. Follow any
citation below directly; re-verify the surrounding code anyway.

The `##` sections below are **curated groups**, not the usual per-producer `## Source: <audit>`
sections — each names the criterion that earned its findings a place, because that criterion is the
argument for keeping them. A new producer still appends its own `## Source:` section as normal; the
two shapes coexist and the merge rules are unchanged. Priorities (P2–P5) are the original
within-section ranks and are not comparable across groups; the grouping supersedes them.

## Silent wrong output — instruments and gates that lie

Kept first because this is the class no bug report ever surfaces. Each one produces a confident,
plausible, wrong answer — a metric, a gate verdict, a log, a cost figure — or lets a failure pass as
a success. Nobody files a bug against a number; they just make decisions on it.

### [Correctness] retouch-line-art.mjs double-encodes its output, silently discarding WEBP_QUALITY

**File(s):** `tools/asset-gen/legacy/retouch-line-art.mjs` (`normalize` lines 112–119, write at
lines 134–137) @ f5bf8767

**Priority:** P3

#### Problem

`normalize()` already produces the final webp at the tool's declared quality:

```js
async function normalize(buf, width, height) {
  return sharp(buf)
    .resize(width, height, { fit: 'fill' })
    .grayscale()
    .linear(1.25, -18)
    .webp({ quality: WEBP_QUALITY }) // 92
    .toBuffer();
}
```

but the write path then runs the encoded buffer through sharp again:

```js
const out = await normalize(edited, width, height);
…
await sharp(out).toFile(dest);
```

`sharp(out).toFile('*.webp')` decodes the q92 webp and re-encodes it with sharp's **default** webp
quality (80). Net effect: two lossy generations, and the `WEBP_QUALITY = 92` constant (line 42) is
dead — the shipped candidate is q80 of a q80-decoded q92 image. This is a kept-runnable tool (the
README markets its `--instruction` mode as the template for one-off line-art edits), so the defect
propagates into any future edit built from this template. Extra risk for this tool specifically:
line-art candidates get copied over `*.outline.webp`, where compression ringing on edges is exactly
what the chalk-crisping decision record documents as harmful.

#### Proposed solution

Replace the re-encode with a plain write:

```js
import { writeFile } from 'node:fs/promises';
…
await writeFile(dest, out);
```

(`mkdir` already precedes it). One-line fix; behavior otherwise identical.

### [Correctness] Mocked lib constants in audit-cli.test.mjs have already drifted from their real values

**File(s):** `tools/asset-gen/tests/audit-cli.test.mjs` (mock factories, lines 58–139),
`tools/asset-gen/tests/light-fill-cli.test.mjs` (lines 46–48) @ f5bf8767

**Priority:** P2

#### Problem

The audit-CLI plumbing tests replace each scorer module with a `vi.mock` factory that **re-declares
the module's exported threshold constants as literals**, and four of them no longer match the real
module:

```js
// audit-cli.test.mjs:77-79
vi.mock('../lib/eye-fill.mjs', () => ({
  EYE_RING_DEPTH_MAX: 5,          // real: lib/eye-fill.mjs:173 → 4
```

```js
// audit-cli.test.mjs:105-108
vi.mock('../lib/night-scores.mjs', () => ({
  DRIFT_THRESHOLD_DEFAULT: 0.1,   // real: lib/night-scores.mjs:29 → 0.004
  NIGHT_BG_LUMA_MAX_DEFAULT: 50,  // real: lib/night-scores.mjs:40 → 60
  LINE_WHITE_MIN_DEFAULT: 200,    // real: lib/night-scores.mjs:136 → 150
```

The other mocked constants (`KEEP_THRESHOLD: 0.92` / `LOCAL_KEEP_THRESHOLD: 0.8` at lines 45–46,
`SOLID_BLOB_MAX: 100` / `SOLID_INTERIOR_MAX: 60` at lines 62–63, and the same outline-match pair in
`light-fill-cli.test.mjs:47-48`) currently match — but that is coincidence, not enforcement; they
will drift exactly the way the four above already did. The repo convention says cross-file agreement
is never maintained by prose, and these are cross-file value agreements maintained by copy-paste.
Today the drifted values are behaviorally harmless (the mocked scorers always return passing
results, so the thresholds only flow into log formatting), which is precisely why nobody noticed — a
reader debugging a bin script against these tests sees `EYE_RING_DEPTH_MAX: 5` and is misled, and if
a bin script ever starts comparing against a mocked threshold the tests will exercise the wrong bar
silently.

#### Proposed solution

Use the `importOriginal` spread pattern **already used in the same file** for `../lib/cli.mjs`
(audit-cli.test.mjs:33–38): import the real module, spread it, and override only the scorer
functions:

```js
vi.mock('../lib/eye-fill.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  scoreEyeRings: async (buffer) => { assertReadable(buffer); return { maxDepth: 0, passes: true }; },
  ...
}));
```

The scorer libs import `sharp`, so `importOriginal` pays a real module load — acceptable here (sharp
is already loaded by sibling suites in the same run). If that cost is deemed too high for these two
files, the alternative is obviously-fake sentinel values (`EYE_RING_DEPTH_MAX: 9999`) so no reader
can mistake them for the real bars — but the spread fixes drift outright and is the same pattern the
file already established.

### [Testing] diffGoldenPage silently ignores metric paths missing from the score shape — a renamed producer key disables its gate

**File(s):** `tools/asset-gen/lib/golden-catalog.mjs` (`diffGoldenPage`, lines 60–82; skip
conditions lines 64, 76) @ f5bf8767

**Priority:** P4

#### Problem

`GOLDEN_METRICS` and `GOLDEN_VERDICTS` (lines 18–53) address the score object built in
`bin/audit-golden.mjs` via dotted string paths (`'night.bgLuma'`, `'light.eyesOk'`, …). The diff
loops skip any path that doesn't resolve:

```js
if (was === now || was === undefined || now === undefined) continue;   // verdicts
...
if (was == null || now == null || was === now) continue;               // metrics
```

`null` legitimately means "not scoreable" (and the verdict loop reports it as "scoreability
changed"), but `undefined` means "key absent" — and it takes the same silent path. So if
`audit-golden.mjs` renames or drops a field (or a typo lands in a `GOLDEN_METRICS` key), that
regression channel just stops firing: `gen:coloring-golden:diff` keeps exiting 0 while one of its
gates is dead. The existing `tests/golden-catalog.test.mjs` exercises the diff with hand-built
partial objects, so it cannot catch shape drift against the real producer.

#### Proposed solution

Two cheap layers: (1) in `diffGoldenPage`, distinguish `undefined` from `null` — push an
`out.regressions` (or at least `out.info` with a loud prefix) entry like
`"${rel}  ${path} MISSING from score shape"` when exactly one side is `undefined` on a *current*
score; (2) add a drift-guard test that scores one committed fixture page through the same scoring
path `audit-golden.mjs` uses and asserts every `GOLDEN_METRICS`/`GOLDEN_VERDICTS` path resolves to
non-`undefined`. The second layer requires the score assembly to be importable — worth extracting
from `bin/audit-golden.mjs` into `golden-catalog.mjs` anyway, since the path vocabulary and the
shape producer belong together.

### [Correctness] Dark-theme token values have drifted between the duplicated theme blocks in scrapbook-chrome

**File(s):** `scripts/lib/scrapbook-chrome.mjs` (`CHROME_CSS`, lines 53–65 vs 77–87) @ f5bf8767

**Priority:** P2

#### Problem

`CHROME_CSS` states each theme's custom properties twice: once for the OS preference
(`@media (prefers-color-scheme: dark)`, lines 53–65) and once for the explicit toggle
(`:root[data-theme=dark]`, lines 77–87). The light pair (`:root` at lines 38–51 vs
`:root[data-theme=light]` at lines 66–76) is byte-identical, but the two dark blocks disagree on six
tokens:

| token           | `@media` dark (l. 55–57) | `[data-theme=dark]` (l. 79–83) |
| --------------- | ------------------------ | ------------------------------ |
| `--card`        | `#1d1f27`                | `#1c1e24`                      |
| `--card-2`      | `#181a20`                | `#191b20`                      |
| `--muted`       | `#a8a4af`                | `#a19da8`                      |
| `--faint`       | `#807d89`                | `#797682`                      |
| `--hair`        | `#34373f`                | `#2b2e36`                      |
| `--hair-strong` | `#464a55`                | `#3a3e48`                      |

So a viewer whose OS is dark sees different card/hairline/muted colors than a viewer who used a
theme toggle to select dark — on every published scrapbook page (index, icons sheet, model-eval
report, which layers `EXTRA_CSS` on this at `scripts/lib/model-eval-report.mjs` lines 90–94 using
the same two-block pattern, there without drift). Nothing marks the divergence as intentional; it is
exactly the failure mode the repo convention ("cross-file agreement is never maintained by prose")
exists to prevent, here within a single file.

#### Proposed solution

Stop hand-writing each palette twice. Define the token sets once as JS objects and emit them into
all selectors:

```js
const LIGHT_TOKENS = { paper: '#f5f3ee' /* … */ };
const DARK_TOKENS = { paper: '#131418' /* … */ };
const cssVars = (tokens) => Object.entries(tokens).map(([k, v]) => `--${k}:${v};`).join('');
```

then interpolate `cssVars(DARK_TOKENS)` into both the `@media` block and `:root[data-theme=dark]`.
This removes the whole drift class (and shrinks the file). If the current rendered look must be
preserved exactly, first decide which of the two dark palettes is the intended one. The same
generator-object approach could also be offered to page-specific CSS like model-eval-report's
`--a`/`--b` pair, but that is optional.

### [Correctness] `inlineImage` silently emits `data:undefined;…` for an unmapped extension

**File(s):** `scripts/lib/scrapbook-chrome.mjs` (`inlineImage`, lines 282–292; `MIME`, lines
273–278) @ f5bf8767

**Priority:** P4

#### Problem

The pass-through branch (line 291):

```js
return `data:${MIME[extname(path).toLowerCase()]};base64,${buf.toString('base64')}`;
```

For any extension outside the four-entry `MIME` map (`.svg`, `.gif`, `.avif`, a typo'd name), the
lookup is `undefined` and the generator embeds the literal string `data:undefined;base64,…` into a
committed, published page — a broken image discovered only by eyeballing the output. Also, the sharp
branch's `quality: 78` (line 288) is a tuning literal that per convention wants a named constant
(`INLINE_WEBP_QUALITY = 78`) carrying the size/fidelity rationale currently squeezed into the doc
comment.

#### Proposed solution

Fail closed:

```js
const mime = MIME[extname(path).toLowerCase()];
if (!mime) {
  throw new Error(
    `inlineImage: no MIME mapping for ${path} — add it to MIME in scrapbook-chrome.mjs`,
  );
}
```

Generators run at publish time, so a loud throw is strictly better than a silently broken committed
page. Name the quality constant while in the file.

### [Correctness] model-eval-fixtures silently renders fixtures with missing coloring assets

**File(s):** `scripts/model-eval-fixtures.mjs` (`assetUri`, lines 78–82; used at 124, 156, 177–179,
195–199) @ f5bf8767

**Priority:** P4

#### Problem

`assetUri` returns `null` when the `.webp` doesn't exist (line 80), and most call sites pass the
result straight into a layer with no check:

```js
layers: [
  …
  { op: 'outline', uri: assetUri(book, page, o, 'outline') },
],
```

Only the night category has fallbacks (`assetUri(…, 'chalk') || assetUri(…, 'outline')`, line 195).
Everywhere else, a renamed page or book in `web/static/coloring/` yields `uri: null`, the in-page
renderer draws nothing for that layer, and the corpus quietly gains a blank-or-partial "coloring
page" fixture — which then skews the model eval it feeds. `scripts/CLAUDE.md` calls for exactly the
opposite: "Multi-item CLI runs: validate inputs up front with a path-specific one-line error and a
non-zero exit."

#### Proposed solution

Make missing assets loud: in `assetUri`, `throw new Error(\`missing coloring asset:
${p}\`)`(with the night fallback expressed as an explicit`optionalAssetUri`or a try-order list), or collect all missing paths during spec construction and`fail()`with the list before launching the browser. The specs are built eagerly at module load, so an upfront sweep over`specs`checking every`uri
!== null`before`main()` starts is a three-line guard.

### [Correctness] model-eval-gen-inputs builds a data URI with the invalid MIME `image/*`

**File(s):** `scripts/model-eval-gen-inputs.mjs` (line 87) @ f5bf8767

**Priority:** P4

#### Problem

```js
const dataUri = `data:image/*;base64,${raw.toString('base64')}`;
```

`image/*` is a media-type *range*, not a media type — it is not valid in a data URI. The script
works today only because Chromium content-sniffs the payload, an implementation kindness the spec
doesn't promise (Firefox, for one, refuses to render `data:image/*` URIs). The repo already owns a
format detector — `imageFormat(buffer)` in `scripts/lib/model-eval.mjs` (imported by
`model-eval-run.mjs` at line 31 for exactly this: distinguishing png/jpeg from magic bytes) — so the
correct MIME is one call away.

#### Proposed solution

```js
const fmt = imageFormat(raw); // 'png' | 'jpeg' | …
const dataUri = `data:image/${fmt === 'jpeg' ? 'jpeg' : 'png'};base64,${raw.toString('base64')}`;
```

(or reject/log when `imageFormat` can't identify the payload, which today would surface as an opaque
`img.onerror`).

### [Correctness] status.mjs labels invalid drops as "completed", the exact conflation burndown.mjs warns against

**File(s):** `scripts/audit-burndown/status.mjs` (lines 25–40) @ f5bf8767;
`scripts/audit-burndown/burndown.mjs` (lines 316–318, 721–724)

**Priority:** P3

#### Problem

burndown.mjs appends **two** kinds of lines to `completed.log`: real fixes (`${sha}  ${title}`,
line 849) and invalid drops (`${sha}  [invalid]  ${title}`, lines 568–571). It keeps `done` and
`dropped` separate precisely because — its own comment, lines 455–457 — "conflating them in the
summary makes the closeout AUDIT-LOG row wrong in the flattering direction." status.mjs then commits
that sin:

```js
const done = countLines(join(WORK, 'completed.log'));
…
console.log(`completed  ${done}`);
```

Every drop inflates "completed". A supervising agent using `npm run audit:status` to fill the
AUDIT-LOG closeout row (the documented workflow) copies the flattering number.

#### Proposed solution

Split on the marker burndown already writes:

```js
const lines = existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()) : [];
const droppedCount = lines.filter((l) => l.includes('  [invalid]  ')).length;
const fixedCount = lines.length - droppedCount;
```

and print `completed`, `dropped`, `deferred` as three rows. The `[invalid]` marker string becomes a
shared constant in lib.mjs (same drift argument as the other boundary strings; burndown writes it,
status parses it).

### [Correctness] `backfill-comments done <sha>` with a short prefix can drop several records while marking only one posted

**File(s):** `scripts/audit-burndown/backfill-comments.mjs` (lines 186–202) @ f5bf8767

**Priority:** P4

#### Problem

```js
const remaining = store.filter((r) => !r.sha.startsWith(sha));
…
const [dropped] = store.filter((r) => r.sha.startsWith(sha));
writeStore(remaining);
appendFileSync(POSTED, `${dropped.sha}\n`);
```

`done` accepts any prefix. If the operator (an agent pasting a short SHA) supplies a prefix matching
two pending records — unlikely with 12 chars, plausible with the 7-char form git prints elsewhere —
*all* matches are removed from the store but only the first is appended to `POSTED`. The extra
records are neither pending nor recorded as posted: `capture` will then re-add them (they fail the
`posted.has(sha)` check at line 158), which is survivable but exactly the re-arming confusion the
`POSTED` file exists to prevent (lines 27–37). The double `filter` over the same predicate is also
wasted work.

#### Proposed solution

Partition once and refuse ambiguity:

```js
const matches = store.filter((r) => r.sha.startsWith(sha));
if (matches.length > 1) {
  console.error(
    `ambiguous prefix ${sha} matches ${matches.length} pending records — use more characters`,
  );
  process.exit(1);
}
```

then drop exactly `matches[0]`.

### [Correctness] Iteration tag omits `dropped`, so a drop makes the next finding reuse the same log-file names

**File(s):** `scripts/audit-burndown/burndown.mjs` (line 1126) @ f5bf8767;
`scripts/audit-burndown/cost.mjs` (lines 11–31, 57); `scripts/audit-burndown/backfill-comments.mjs`
(lines 100–112)

**Priority:** P2

#### Problem

```js
const tag = `iter${String(done + deferred + 1).padStart(4, '0')}`;
```

Only fixes and deferrals advance the tag. When a finding is dropped as INVALID (`dropped += 1` at
line 572; `done`/`deferred` unchanged), the *next* finding computes the identical tag. Consequences:

* `runAgentStep` writes envelopes with `writeFileSync(join(logsDir,`${tag}.json`), out)`
  (agent-runner.mjs line 285), so the next finding's `iterNNNN.verify.json` **overwrites** the
  dropped finding's verify envelope — the very record that explains *why* it was dropped, which the
  verifier prompt (verifier.md lines 21–28) goes to great lengths to make auditable ("lets a reader
  who audits the drop commits later tell 'the audit was wrong' from 'the audit is working as
  designed' apart"). The reason survives only as one line in the commit message.
* `${tag}.err` is `appendFileSync`'d (agent-runner.mjs line 286), so stderr from two different
  findings interleaves in one file.
* `cost.mjs` counts one `.verify` file where two verify calls were paid (line 57
  `calls.filter((call) => call.file.includes('.verify')).length`), and the overwritten call's
  cost/turn/error record disappears from the "any capped or errored calls" table.
* `backfill-comments.mjs`'s mtime heuristic (lines 100–112) is built to disambiguate same-named
  files **across runs**; same-named files **within one run** were plainly not anticipated.

#### Proposed solution

Include drops in the counter: `done + dropped + deferred + 1` — i.e. one tag per popped finding,
which is what "iteration" means everywhere else (run.log, backfill). Verify nothing parses the tag
number as a fixes-only ordinal (status.mjs and backfill match `iter\d+` opaquely, so they're fine).
A one-character fix plus a regression test in `scripts/tests/` once the loop is testable.

### [Correctness] The finish path swallows a failed final push — an unattended run can end "successfully" with unpushed commits

**File(s):** `scripts/audit-burndown/burndown.mjs` (`pushBatch`, lines 335–350; finish, lines
1034–1046) @ f5bf8767

**Priority:** P3

#### Problem

The whole design says an unpushed commit is a lost commit: the `PUSH_EVERY` comment (lines 82–87) —
"an unpushed commit is a commit at risk: the only durable artifact is what is on origin". Yet the
final flush ignores its own failure signal:

```js
if (sincePush > 0) pushBatch({ final: true });
…
logLine(`finished: ${done} fixed, …`);
```

`pushBatch` returns `false` on a red `PUSH_TEST_CMD` or a failed push (lines 473–486) — a return
value no call site ever reads (lines 326, 577, 872, 877). Mid-run that's fine (the next boundary
retries), but at the *end* there is no next boundary: the process logs a normal `finished:` line and
exits 0. A supervising agent (or the overnight log reader) sees a clean completion while the tail of
the run sits only in a reclaimable container. The mid-run "will retry next batch" copy inside
`pushBatch` is also wrong for the `final` case, which its own message text acknowledges ("commits
held locally, not pushed") without escalating.

#### Proposed solution

Have the finish path act on the result:

```js
if (sincePush > 0 && !pushBatch({ final: true })) {
  logLine(
    `WARNING: ${sincePush} commit(s) not on origin — push manually before the container is reclaimed`,
  );
  process.exitCode = 1;
}
```

Exit code 1 makes the failure visible to `overnight.log` scrapers and any wrapper. Since the return
value then has a real consumer, the unused-return smell disappears too.

### [Correctness] The implementer's self-reported SHA is trusted verbatim over git, with no format or ancestry validation

**File(s):** `scripts/audit-burndown/lib.mjs` (`resolveImplSha`, lines 42–45) @ f5bf8767;
`scripts/audit-burndown/burndown.mjs` (lines 755–766, 837, 916–932, 1004–1008)

**Priority:** P3

#### Problem

```js
export function resolveImplSha({ reported, head, baseSha }) {
  if (reported) return reported;
  return head && head !== baseSha ? head : '';
}
```

`reported` is LLM-authored (`impl.structured.sha`). The driver sanitizes the other LLM-authored
strings that reach commands hard — burndown.mjs lines 596–600 on `e2e_specs`: "these strings are
LLM-authored and reach a shell, so keep only spec-path-shaped values" — but the SHA is used
unvalidated as a git argument in the reviewer prompt's range (`${baseSha}..${sha}`, line 702),
`gitOut('diff', baseSha, sha, …)` (line 820), and `gitOut('rev-list', '--count',`
${baseSha}..${sha}`)` (line 823). Worse, when `reported` and `head` *both* exist and disagree —
implementer reports a short SHA despite the prompt (implementer.md lines 40–41 begs for 40 chars
precisely because it happens), or reports the first round's SHA after a second commit, or
hallucinates — the envelope wins over git. That inverts the module's own stated philosophy (lib.mjs
lines 30–33: "Trust git over the envelope"). The reviewer then reviews the wrong range, or git
errors mid-flow on a garbage ref.

#### Proposed solution

Validate and prefer git:

```js
export function resolveImplSha({ reported, head, baseSha }) {
  const moved = head && head !== baseSha ? head : '';
  if (moved) return moved;
  return /^[0-9a-f]{40}$/.test(reported ?? '') ? reported : '';
}
```

Since `head` is `gitOut('rev-parse', 'HEAD')` captured right after the step, it is always at least
as authoritative as `reported`; keep `reported` only as the fallback (with the hex-shape check) for
the legacy-envelope case the comment describes. Log when the two disagree so a misreporting role is
visible. Update the `resolveImplSha` unit tests in `scripts/tests/audit-burndown-lib.test.mjs` for
the new precedence.

### [Correctness] pop.mjs treats any unknown flag as "print", so a typo'd `--delete` silently succeeds without deleting

**File(s):** `scripts/audit-burndown/pop.mjs` (lines 18, 25–50) @ f5bf8767

**Priority:** P3

#### Problem

```js
const mode = process.argv[2] ?? 'print';
```

The mode is then compared against `--count`, `--peek`, and (at line 50) `--delete`; anything else
falls through the whole ladder and behaves as `print`, exit 0. So `pop.mjs --delte` (or `--pop`,
`-d`, a stray argument) prints the first entry and reports success — and the caller, typically an
*agent* following a runbook, now believes the entry was consumed when the backlog is untouched. The
header documents "Exit codes: … 2 bad usage" (line 10) but bad usage is only detected for `--peek`'s
argument. For a tool whose whole reason to exist is deterministic surgery no agent should improvise
around (lib.mjs lines 348–355), silently doing the wrong-but-plausible thing on a typo is the worst
failure shape.

#### Proposed solution

Close the mode set:

```js
const MODES = new Set(['print', '--delete', '--count', '--peek']);
if (!MODES.has(mode)) {
  console.error(`pop: unknown mode ${mode} (see header for usage)`);
  process.exit(2);
}
```

(Also aligns with the CLAUDE.md "close finite value sets" instinct, applied at a CLI boundary.)

### [Correctness] lighthouse run-audit summary table ingests stale and priming reports from the output dir

**File(s):** `.ruler/skills/lighthouse-audit/run-audit.mjs` (`printSummary`, lines 205–235; priming
pass lines 63–65) @ f5bf8767

**Priority:** P4

#### Problem

`printSummary()` globs **every** `*.report.json` in `--out` (line 208), not just the files this run
wrote. Two consequences:

* The default `--out lighthouse-reports/` is reused across runs (it's a stable gitignored dir), so a
  `--device phone` run's summary silently includes last week's tablet rows — against a different URL
  if `--url` changed — with nothing marking which rows are fresh. The skill then says to build the
  AUDIT.md score table from "the console summary" (SKILL.md lines 99–101), so stale rows can flow
  straight into findings.
* A repeat-only run (`--visits repeat`) first executes a priming pass named `${name}-prime`
  (line 64) whose reports land in the same dir; the summary prints the throwaway priming row
  (`phone-portrait-repeat-prime`) as if it were a measurement.

#### Proposed solution

Track the names actually run this invocation (they're already computed in the main loop) and have
`printSummary(names)` read only those files; alternatively write priming output to a temp subdir and
filter `-prime` from the glob. Keeping the "read whatever's there" behavior behind an explicit
`--summarize-existing` flag would preserve the re-summarize use case without contaminating fresh
runs.

### [Testing] The cloud-setup test harness can rot silently: an unchecked source patch and an answer-anything `node` stub

**File(s):** `scripts/tests/claude-cloud-setup.test.mjs` (`runSetup`, lines 16–74; the `replaceAll`
at line 23; the `node` stub at lines 39–49) @ f5bf8767

**Priority:** P3

#### Problem

Two fixture seams in `runSetup` fail without signal when `.claude/cloud/setup.sh` changes:

1. Line 23 patches the script under test by string replacement:

```js
const setup = readFileSync(setupPath, 'utf8').replaceAll('/usr/local/bin/chisel', chisel);
```

If setup.sh ever renames or parameterizes that install path, `replaceAll` silently matches nothing
and the fixture runs the *unpatched* script, which then tries to write to the real
`/usr/local/bin/chisel` — producing a permission-denied → spurious extra warning → a confusing
assertion failure about warning counts, several steps removed from the actual cause (and on a
privileged CI runner, potentially a real write outside the tmpdir).

2. The `node` stub (lines 39–44) ignores its arguments entirely and always prints
   `$PLAYWRIGHT_VERSION`. The sibling `npx` stub carefully branches on `"$*"`; if setup.sh gains any
   *other* `node` invocation, the stub feeds it a version string and exits 0, silently corrupting
   whatever that step does.

#### Proposed solution

For (1), assert the patch took: `expect(setup).not.toBe(original)` (or
`expect(setup).toContain(chisel)`) immediately after the `replaceAll`, so a renamed path fails with
"fixture patch no longer matches setup.sh" instead of a downstream warning-count mismatch. For (2),
mirror the `npx` stub's shape — match the specific argument pattern setup.sh uses to derive the
Playwright version and `exit 1` on anything else. Optionally extract the four `writeExecutable`
blocks into named helpers (`stubNpx(bin)`, `stubNodeVersionProbe(bin)`, …) so `runSetup` reads as a
list of seams.

---

### [Testing] Replace the `fn.toString()`-sniffing evaluate stub in the undo-scenarios test with a routed fake that fails loudly

**File(s):** `scripts/tests/undo-scenarios.test.mjs` (`page.evaluate` mock, lines 207–231; the
single `it`, lines 198–281) @ f5bf8767

**Priority:** P2

#### Problem

The only test of `scripts/perf/undo-scenarios.mjs` stubs `page.evaluate` by string-matching the
*source text* of whatever function the production code passes in:

```js
evaluate: vi.fn(async (fn) => {
  const source = fn.toString();
  if (source.includes('getUndoDebug')) { … }
  if (source.includes('document.querySelector')) { … }
  if (source.includes("getEntriesByType('measure')")) { … }
  if (source.includes('async (maxUndoSteps)')) return 1;
  if (source.includes('performance.now')) return 0;
  return undefined;
}),
```

Three compounding fragilities:

1. **Order-sensitive overlap.** The real function at `scripts/perf/undo-scenarios.mjs:254` is
   `async (maxUndoSteps) => { … performance.now() … }` — it contains *both* the
   `'async (maxUndoSteps)'` marker and `'performance.now'`. Only the current if-ordering routes it
   correctly; reordering the checks (or renaming the parameter in the source under test) silently
   reroutes it to the `performance.now → 0` branch.
2. **Silent `undefined` fallback.** Any new `page.evaluate` call site added to `undo-scenarios.mjs`
   returns `undefined` from the stub, producing a downstream failure (or worse, a pass) far from the
   cause instead of an immediate "unmatched evaluate" error.
3. The single 80-line `it` builds the fake page, CDP session, context, browser, clock, and console
   spies inline, then asserts seven different things — there are no named seams for a reader to
   follow.

This is exactly the kind of stub that rots invisibly when the production file is refactored: the
test keeps passing while exercising different branches than it claims.

#### Proposed solution

Extract a routed stub with an explicit contract and a loud default:

```js
function stubPageEvaluate(routes /* : Array<{ marker: string, result: (callCount) => unknown }> */) {
  return vi.fn(async (fn, ...args) => {
    const source = fn.toString();
    const route = routes.find(({ marker }) => source.includes(marker));
    if (!route) throw new Error(`Unmatched page.evaluate:\n${source}`);
    return route.result(...);
  });
}
```

Order the routes most-specific-first and keep the maxUndoSteps/performance.now overlap documented in
the route list. Also pull `makeFakePage()` / `makeFakeBrowser(page)` out as named builders so the
`it` body reads as scenario → run → assertions. Gotcha: the `navigations === 3` conditional inside
the current `getUndoDebug` branch is load-bearing (it makes exactly one scenario time out); keep it
as an explicitly named `coldTierNeverSettlesOnNavigation(3)` route rather than an inline ternary.

---

### [DX] `run()` swallows the spawn error when the command itself can't be launched

**File(s):** `scripts/lib/proc.mjs` (`run`, lines 61–69; `capture`, lines 113–117) @ f5bf8767

**Priority:** P3

#### Problem

`run()` checks only `result.status`:

```js
const result = spawnSync(cmd, args, { … });
if (result.status !== 0) process.exit(result.status ?? 1);
```

When the command cannot be spawned at all (ENOENT — a missing SDK tool, `plutil` on Linux, an unset
PATH), `spawnSync` returns `{ error: Error, status: null }` and nothing is written to stdio. The
script prints `$ cmd args` and exits 1 with **no error message at all** — the classic "why did my
script silently die" trap, in the single most-used helper in `scripts/`. `capture()` (line 96) is
only slightly better: `fail(\`${cmd} failed (exit ${result.status})…\`)` prints "failed (exit null)"
and an empty stderr for the same case, hiding the ENOENT.

#### Proposed solution

Surface `result.error` in both helpers before exiting:

```js
if (result.error) fail(`Failed to launch ${cmd}: ${result.error.message}`);
if (result.status !== 0) process.exit(result.status ?? 1);
```

and in `capture()` include `result.error?.message` in the failure line. Two lines, and every script
that shells out through proc.mjs gets an actionable message for missing-binary failures.

## App correctness that reaches users

Behaviour defects in shipped `web/src/` and native-shell code. These are the ones that would
eventually arrive as a bug report — but the reporter is a two-year-old, so they won't.

### [Correctness] Validate the `version.json` payload — a versionless 200 response causes `?v=undefined` and an infinite redirect loop

**File(s):** `web/src/lib/pwa/updates.ts` (`checkVersionMismatch`, lines 144–152) @ f5bf8767

**Priority:** P3

#### Problem

```ts
const resp = await fetch('/version.json', { cache: 'no-store' });
if (!resp.ok) return;
const { version } = await resp.json();
if (version !== __APP_VERSION__ && version !== attemptedVersion) {
```

`resp.json()` returns `any`; `version` is destructured with no runtime check, violating the
"cast/validate at the wire boundary" convention. If a captive portal, misconfigured proxy, or broken
deploy ever serves a 200 JSON body without a string `version` field, `version` is `undefined`, which
`!==` both compared strings, so the client navigates to `?v=undefined`. Worse, the
one-attempt-per-version loop guard then fails structurally: on the next load `attemptedVersion` is
the *string* `'undefined'` (read from the URL at line 98) while `version` is the *value* `undefined`
— they never compare equal, so the client redirects again, forever. The module header's promise
("one attempt per deployed version, no reload loop", lines 28–29) doesn't hold for non-string
payloads.

#### Proposed solution

Guard the field before using it:

```ts
const { version } = (await resp.json()) as { version?: unknown };
if (typeof version !== 'string' || version.length === 0) return;
```

That single check fixes both the bogus redirect and the loop (a malformed payload simply skips
cache-busting; the next healthy deploy resolves it). Add two unit tests to the existing
`checkVersionMismatch` suite: `{}` payload → no redirect; non-JSON→`json()` rejects is already
covered by the catch.

### [Correctness] `hydrateDurableStorage` bypasses the module's own safe localStorage wrappers, so one throw aborts the whole restore

**File(s):** `web/src/lib/storage.ts` (`hydrateDurableStorage`, lines 179–208; raw reads/writes at
187 and 191) @ f5bf8767

**Priority:** P3

#### Problem

The first half of this file exists because "localStorage.setItem can throw — QuotaExceededError …
SecurityError" (lines 34–38) and "merely touching the `localStorage` global raises SecurityError"
(lines 51–55). Yet the restore loop touches localStorage raw:

```ts
hydrationKeys.forEach((key, i) => {
  const local = localStorage.getItem(key);
  ...
  if (action.restore !== undefined) {
    localStorage.setItem(key, action.restore); // WebView lost it — recover from durable store
```

A throw from either call propagates out of the `forEach`, is swallowed by
`runWithDurablePreferences`'s blanket `catch` (line 89), and silently abandons every remaining key —
no restore, no backup, no warning. The bitter irony: iOS storage pressure is both the scenario this
function exists to recover from *and* a scenario where `setItem` throws `QuotaExceededError`. The
keys that happen to sort after the failing one just stay lost, and nothing distinguishes this from a
clean run (the partial `restored` flag still fires `notifyDurableRestore`).

#### Proposed solution

Use the module's own `safeStorageRead`/`safeStorageMutation` inside the loop:

```ts
const local = safeStorageRead(() => localStorage.getItem(key), null);
...
safeStorageMutation(() => localStorage.setItem(key, action.restore));
```

Per-key failures then degrade to a warn-once console message while every other key still reconciles.
One subtlety: a failed `setItem` should ideally not count toward `restored` for that key, but the
existing warn-once machinery doesn't report per-call success — keeping `restored = true` (stores
re-read and fall back to defaults for the lost key) is acceptable and simpler. Extend
`storage.test.ts`'s throwing-localStorage suite with a native hydrate case.

### [Correctness] A failed orientation lock latches `lastRequested`, permanently suppressing same-target retries for the session

**File(s):** `web/src/lib/orientation.ts` (`applyDeviceOrientationPreference`, lines 11, 29–30,
42–46, 57) @ f5bf8767

**Priority:** P3

#### Problem

The dedup latch is set *before* the async lock attempt and never rolled back on failure:

```ts
if (target === lastRequested) return;
lastRequested = target;
```

Native path (lines 42–46): if `ScreenOrientation.lock()` throws (plugin not ready during a boot
race, OS transiently refuses), the catch swallows it — but `lastRequested` still holds `target`, so
every later call with the same preference short-circuits at line 29. The comment says "the setting
stays persisted for the next launch", i.e. the accepted cost is a whole relaunch, yet a one-line
rollback would recover within the session. Web path (line 57):
`orientation?.lock?.(target).catch(() => {})` — browsers commonly reject `lock()` outside
fullscreen. The user later enters fullscreen (the app has a fullscreen affordance), the preference
is re-applied from `+page.svelte` — and is silently skipped because the latch claims the lock
already took. The latch conflates "requested" with "applied".

Secondary issue: `lastRequested` is module-scope mutable `let` that is neither a pure memoization
cache nor behind a `createX()` factory (the stated convention in `CLAUDE.md`), which is also why
this module has no unit tests (see separate finding).

#### Proposed solution

Reset the latch when the attempt fails so the next call retries:

```ts
} catch {
  lastRequested = null;
}
```

on the native branch, and `orientation?.lock?.(target).catch(() => { lastRequested = null; })` on
the web branch. Alternatively restructure as `createOrientationLock()` returning `{ apply }` with
the latch inside, exported as a singleton instance for the app — which both fixes testability and
makes the latch's lifecycle explicit. Gotcha: don't retry in a loop — the latch reset only re-arms
the *next* explicit apply call, which is the right behavior.

### [Correctness] `measureSafeAreaInsets` silently returns garbage if its cached probe is ever detached

**File(s):** `web/src/lib/safeArea.ts` (`measureSafeAreaInsets`, lines 16–37) @ f5bf8767

**Priority:** P4

#### Problem

The probe `<div>` is created once, appended to `document.body`, and cached in module state forever
(lines 20–27). `getBoundingClientRect()` on a *detached* element returns an all-zero rect, so if
anything ever removes the probe from the DOM — a full-body re-render, test DOM cleanup between
happy-dom cases, a future migration that replaces `document.body` content — the function keeps
"working" but returns `{ top: 0, right: clientWidth, bottom: clientHeight, left: 0 }`: a fabricated
right/bottom inset the size of the whole viewport. Downstream, `layout.svelte.ts`'s `syncViewport()`
(line 61) would push those insets into every consumer (edge-swipe guard bands, notch band,
action-button layout) on the next resize with no error anywhere. The failure mode is silent and
bizarre-looking at the UI layer, which makes it expensive to trace back here.

#### Proposed solution

One-line hardening: treat a disconnected probe as absent —

```ts
if (!safeAreaProbe?.isConnected) {
  safeAreaProbe = document.createElement('div');
  ...
  document.body.appendChild(safeAreaProbe);
}
```

`isConnected` is universally supported far below the repo's browser floor. `safeArea.test.ts` can
pin it with a case that removes the probe (`probe.remove()`) and asserts a re-append plus correct
values on the next call.

### [Correctness] Every page tile in a book announces the same aria-label; `ColoringPage.name` has no production reader

**File(s):** `web/src/lib/components/ColoringBook.svelte` (page-tile button, line 228);
`web/src/lib/state/books.ts` (`ColoringPage.name`, line 78) @ f5bf8767

**Priority:** P3

#### Problem

Line 163:

```svelte
aria-label="{activeBook.name} coloring page"
```

All six page tiles inside a book get the identical label ("Farm coloring page"): a screen-reader or
accessibility-tree consumer cannot distinguish Cat from Cow, and E2E specs cannot target a specific
page by role+name. Meanwhile every page carries a human-readable `name` field ("Cat", "T. Rex",
`books.ts` lines 174–237) that is populated for all 48 pages but — verified by grep — never read by
any production code (only the `book()` builder stores it). Under the repo's "no speculative surface"
rule, a field with no production caller is itself a smell; the aria-label is the caller it was
obviously meant to have.

#### Proposed solution

`aria-label="{page.name} coloring page"` (or `"{page.name} — {activeBook.name}"`). This fixes the
duplicate-label problem and gives `ColoringPage.name` its production reader in one line. If for some
reason the name should not be exposed, the alternative is deleting the `name` field and the second
`page(id, name)` argument — but wiring the label is clearly the better outcome for a picker grid.

### [Correctness] The Save-Data guard is bypassed on the repeat-visit registration path

**File(s):** `web/src/lib/pwa/updates.ts` (`registerDeferredServiceWorker` lines 88–93,
`initPWAUpdates` lines 113–118, `scheduleRegistration` lines 70–83) @ f5bf8767

**Priority:** P4

#### Problem

`registerDeferredServiceWorker` refuses to register under Save-Data — "Save-Data users never get the
~39 MB precache forced on them" (lines 85–87). But `initPWAUpdates` calls `scheduleRegistration()`
directly when a registration already exists (lines 109–114), and `scheduleRegistration` has no
Save-Data check. The stated purpose of that re-register is to *resume an interrupted precache*
(lines 12–13: "so an install interrupted mid-precache resumes") — which is precisely the ~39 MB
download the guard exists to prevent. Sequence: first visit on wifi with Save-Data off →
registration starts, precache interrupted; later visit on metered data with Save-Data on → the
resume path re-registers and the precache continues against the user's expressed preference.

#### Proposed solution

Move the `saveDataEnabled()` check into `scheduleRegistration` (the single choke point), so both
entry paths honor it:

```ts
function scheduleRegistration() {
  if (registrationScheduled || saveDataEnabled()) return;
  ...
}
```

This is safe for update checks: the module header (lines 14–16) already documents that
`checkForUpdates` reaches the existing registration through `getRegistration` without any
re-register. A fully-precached repeat visitor with Save-Data on loses only a redundant `register()`
call. Add a unit test: existing registration + Save-Data on → `register` not called.

### [Correctness] modalDialog leaves stale `--origin-x/y` behind for a later unanchored open

**File(s):** `web/src/lib/actions/modalDialog.svelte.ts` (`$effect`, lines 118–133) @ f5bf8767

**Priority:** P4

#### Problem

```ts
if (o.origin) {
  node.style.setProperty('--origin-x', `${o.origin.x - window.innerWidth / 2}px`);
  node.style.setProperty('--origin-y', `${o.origin.y - window.innerHeight / 2}px`);
}
```

There is no `else` clearing the vars. The `Modal` contract explicitly admits `show(null)`
(`web/src/lib/state/modal.svelte.ts`: `show(origin: Origin | null)`, and `hide()` does not reset
`origin` to null — but nothing forbids a caller passing null). After one anchored open, a later
`show(null)` on the same dialog replays `dialogFlyFromOrigin` (`app.css` line 113, reading
`var(--origin-x, 0px)`) from the *previous* button's position instead of the centered default. The
launch guard handles this case correctly one line later (`guardLaunchZone(o.origin ?? null)` arms
nothing); the fly-in doesn't.

#### Proposed solution

Add the else branch:
`node.style.removeProperty('--origin-x'); node.style.removeProperty('--origin-y');` so the
keyframe's `0px` fallback applies. One-line fix, and it makes the `origin: null` path actually mean
"no anchor" end to end.

### [Correctness] Native shell chrome is hard-coded light while the app ships dark mode

**File(s):** `android/app/src/main/res/values/styles.xml` (lines 5–10) · `capacitor.config.json`
(lines 8–13) @ f5bf8767

**Priority:** P2

#### Problem

Version 1.4.0 shipped dark mode (see `fastlane/metadata/android/en-US/changelogs/6.txt`: "Dark mode
— Light, Dark, or follow your device"), and the launch assets were made dark-aware (Android has
`drawable-*-night*/splash.png` variants; iOS has `Default@*~universal~anyany-dark.png` splash
variants and a `systemBackgroundColor` launch screen). The native shells behind the WebView were
not:

`android/app/src/main/res/values/styles.xml:5`:

```xml
<style name="AppTheme" parent="Theme.AppCompat.Light.DarkActionBar">
```

A hard-coded `Light` theme means every piece of native chrome that renders outside the web layer —
the window background behind the WebView, WebView-spawned dialogs (file chooser, JS alerts),
permission prompts on API 24–28 for `WRITE_EXTERNAL_STORAGE` — stays light for a child using the app
in dark mode. There is no `values-night/` variant anywhere under `android/app/src/main/res/`.

`capacitor.config.json:8–13` pins both platforms' WebView background to white:

```json
"android": {
  "backgroundColor": "#ffffff"
},
"ios": {
  "backgroundColor": "#ffffff",
  "contentInset": "always"
}
```

That color is what shows in dark mode wherever the web content hasn't painted: the gap between
splash dismissal and first web paint, and on iOS every rubber-band overscroll (made more likely by
`contentInset: "always"`, which insets the scroll view). A dark-theme user gets a white flash on a
canvas app whose whole surface is otherwise dark.

Additionally, the `AppTheme` items at lines 7–9 (`@color/colorPrimary`, `@color/colorPrimaryDark`,
`@color/colorAccent`) resolve to resources the app does not define — they come from the Capacitor
library's own `node_modules/@capacitor/android/capacitor/src/main/res/values/colors.xml`, where all
three are marked `tools:ignore="UnusedResources"` (template Indigo `#3F51B5` / Pink `#FF4081`). The
app's build silently depends on library-internal template resources that a Capacitor upgrade is free
to delete, and the values themselves are meaningless to Splotch's design.

#### Proposed solution

* Change `AppTheme`'s parent to `Theme.AppCompat.DayNight` (the action-bar variant is irrelevant —
  the launch theme replaces it and BridgeActivity shows no action bar), or keep `Light` only if a
  deliberate always-light decision exists — none is recorded.
* Drop the three `@color/color*` items (nothing in Splotch renders them) or, if any native widget
  chrome should be branded, define app-owned colors in `res/values/colors.xml` instead of leaning on
  Capacitor's internals.
* For the WebView background: Capacitor's `backgroundColor` is a single static value, so full dark
  support needs a native touch-up — on Android a `values-night` override is not possible for the
  config value, but `MainActivity` can set the WebView background from the resolved theme
  (`bridge.getWebView().setBackgroundColor(...)`); on iOS `MainViewController.capacitorDidLoad()`
  can set `webView.backgroundColor = UIColor.systemBackground` (dynamic). Alternatively accept the
  static color but document the tradeoff where the value is set.

Gotcha: verify on an API 24 device/emulator that a DayNight theme with the `Theme.SplashScreen`
launch theme still hands off cleanly (the launch theme at line 12 stays as-is; splash night variants
already exist).

### [Maintainability] Pencil-eraser attach silently no-ops if the web view is missing

**File(s):** `ios/App/App/MainViewController.swift` (lines 13–19) @ f5bf8767

**Priority:** P5

#### Problem

```swift
override func capacitorDidLoad() {
    bridge?.registerPluginInstance(DeviceLockPlugin())
    bridge?.registerPluginInstance(pencilEraser)
    if let webView = bridge?.webView {
        pencilEraser.attach(to: webView)
    }
}
```

If `bridge` or `bridge?.webView` were ever nil at `capacitorDidLoad` (a Capacitor upgrade changing
lifecycle timing is the realistic path), Apple Pencil double-tap would silently stop working — no
log, no assertion, and the plugin still registers so the web side sees nothing wrong. The repo's
stated preference elsewhere (e.g. `native-version.mjs`'s "fail closed" transforms) is loud failure
over silent degradation.

#### Proposed solution

Make the impossible case loud in debug builds:

```swift
guard let webView = bridge?.webView else {
    assertionFailure("capacitorDidLoad without a webView — pencil eraser not attached")
    return
}
pencilEraser.attach(to: webView)
```

`assertionFailure` compiles out of Release, so shipping behavior is unchanged; only development
against a future Capacitor picks up the regression immediately.

### [Readability] `ringAnimateKey`'s `Date.now()` suffix is dead — and the flourish cannot replay on a same-swatch re-tap

**File(s):** `web/src/lib/components/ColorPalette.svelte` (lines 58–60, 72, 122) @ f5bf8767

**Priority:** P3

#### Problem

```ts
let ringAnimateKey = $state<string | null>(null);
...
ringAnimateKey = hex + ':' + Date.now();          // line 73
...
class:ring-animate={ringAnimateKey?.startsWith(hex + ':')}   // line 123
```

The only consumer of the key is `startsWith(hex + ':')`, which discards the timestamp entirely — the
state is functionally just "which hex was last tapped". The `Date.now()` suffix strongly implies
per-tap uniqueness was intended (i.e., re-tapping the currently-selected swatch should restart the
confirmation ring), but a class toggle can't deliver that: on a same-swatch re-tap the
`ring-animate` class boolean stays `true`, the CSS animation (`swatch-ring-expand`, `forwards`,
lines 214–230) has already completed, and nothing replays. So the code carries dead complexity *and*
fails the behavior that complexity gestures at.

#### Proposed solution

Decide which behavior is wanted:

* If replay-on-re-tap is *not* needed: simplify to
  `let ringAnimateHex = $state<string | null>(null)` and
  `class:ring-animate={ringAnimateHex === hex}` — same behavior, no fake uniqueness.
* If replay *is* wanted: keep the timestamped key and force an element-level restart, e.g. wrap the
  `::before` host in `{#key ringAnimateKey}` (heavyweight for a button) or, cheaper, drive the
  animation from a `data-` attribute change plus `animation: none`/reflow re-trigger inside
  `selectSwatch`. The first option is the low-risk default; note the flourish is cosmetic, so this
  is not a functional regression either way. Distinct from issue #164 (tap *registration*
  reliability).

### [Architecture] ColorPalette owns the black-ink/theme sync invariant and writes shared state directly from an `$effect`

**File(s):** `web/src/lib/components/ColorPalette.svelte` (`$effect`, lines 36–40) @ f5bf8767

**Priority:** P2

#### Problem

```svelte
$effect(() => {
  if (colors.activeSwatch === BLACK_INK) {
    colors.activeColor = themedSwatchColor(BLACK_INK, dark);
  }
});
```

This encodes a *state-level* invariant — "the black swatch paints white on dark paper, even when the
theme flips live" — inside one component, by assigning `colors.activeColor` directly. Two problems:

1. `.claude/rules/svelte.md` is explicit: "Components read state and call setters; they never own
   shared state." Every other write to `colors` goes through `selectPaletteColor` /
   `pickCustomColor` / `selectCustomSwatch` (`web/src/lib/state/colors.svelte.ts`, lines 47–64);
   this is the sole direct field assignment from a component.
2. The invariant only holds while `ColorPalette` happens to be mounted. Today it always is on the
   drawing route, but the engine consumes `colors.activeColor` independently
   (`web/src/lib/drawing/earlyBoot.ts`, line 38), and nothing about the rule is palette-UI-specific
   — it's a property of the color state itself. A future surface that draws without mounting the
   palette (or a test exercising theme flips against the state module) silently loses the sync.

#### Proposed solution

Move the rule into the state layer. Options, in increasing ambition:

* Minimal: keep the effect where it is but route it through the setter —
  `selectPaletteColor(BLACK_INK, themedSwatchColor(BLACK_INK, dark))` — removing the direct-write
  violation only.
* Better: export `syncInkToTheme(dark: boolean)` from `colors.svelte.ts` (guarding on
  `activeSwatch === BLACK_INK` internally) and invoke it from the place that already observes theme
  changes at module scope — `appearance.svelte.ts` runs `updateThemeColorMeta(resolvedTheme())` on
  every flip (line 38); the ink sync belongs beside it. `ColorPalette` then drops the `$effect`
  entirely.

Tradeoff: option 2 introduces an `appearance → colors` module dependency; that direction seems safe
(colors does not import appearance), but confirm no cycle. Unit-test the new function in
`colors.svelte.test.ts` (theme flip while black selected repaints; while another swatch selected
does not).

### [Maintainability] Missing-input on the verify endpoints answers 200 while the same class of validation answers 400 on `report`

**File(s):** `web/src/routes/api/verify-access-code/+server.ts` (line 28),
`web/src/routes/api/verify-key/+server.ts` (line 25), `web/src/lib/server/report.ts` (lines 115–122)
@ f5bf8767

**Priority:** P4

#### Problem

`.claude/rules/server-api.md` draws the line precisely: HTTP 200 + `{ ok: false }` is reserved for
*failed verification* (so validity isn't disclosed via status); "non-oracle request validation
retains 4xx responses with the same body shape." An absent/blank input is request validation — it
discloses nothing about credential validity — yet:

```ts
if (!code) return json({ ok: false, error: 'No access code provided' });   // 200
...
if (!apiKey) return json({ ok: false, error: 'No API key provided' });     // 200
```

while `report` correctly answers 400 for its equivalent cases (`Please choose bug or feature.`,
`Please type a short description.`). The inconsistency makes the rule harder to learn from the code,
and monitoring can't distinguish client bugs (should be 4xx) from ordinary wrong guesses (200).

#### Proposed solution

Return `json({ ok: false, error: … }, { status: 400 })` for the empty-input branches of both verify
endpoints. The client (`web/src/lib/aiCredential.ts:41`) already computes
`ok: res.ok && data.ok === true`, so behavior is unchanged there; the api-smoke doesn't pin these
cases. Cheap, and it re-aligns the code with its own documented rule — if instead the 200 is
deliberate (keep the oracle surface perfectly uniform), record that in the rule file, which
currently says the opposite.

### [Maintainability] Two wire shapes for JSON errors: thrown `error()` produces `{ message }`, handlers produce `{ ok: false, error }`

**File(s):** `web/src/lib/server/http.ts` (`readJsonBody`, line 15; `throttled`, lines 59–64),
`web/src/routes/api/generate-image/+server.ts` (lines 20, 67–68, 79–81, 124, 144–145) @ f5bf8767

**Priority:** P3

#### Problem

The section's error responses come in two incompatible body shapes:

* `json({ ok: false, error }, { status })` — verify-key, verify-access-code, report, throttled 429s
  (the shape `.claude/rules/server-api.md` documents as canonical).
* `throw error(status, message)` — `readJsonBody`'s 400 (`http.ts:15`) and every generate-image
  failure (400/413/415/422/403/500/502) — which SvelteKit serializes as `{ message }`.

Concretely: a malformed JSON body sent to `/api/verify-access-code` yields a 400 whose body is
`{ message: 'Expected a JSON body' }`; the client (`web/src/lib/aiCredential.ts:37–44`) reads
`data.error`, finds `undefined`, and drops the server's explanation on the floor. The generate-image
portion is partially insulated because its client reads raw text as `detail`, but the split still
means every new endpoint author must know which of two error dialects each helper speaks.

Note: open issue `#567` records this as a *sequencing constraint* ("until the error-shape
unification lands, `ApiErrorResponse = { ok: false; error: string }` is false for `readJsonBody`'s
400 and generate-image's thrown errors") — the unification itself is referenced there but is not
itself an open tracked issue, so filing it here. Coordinate with `#567` rather than duplicating its
contract-types work.

#### Proposed solution

Add a `fail(status, error)` helper next to `throttled()` in `http.ts` returning
`json({ ok: false, error }, { status })`, convert `readJsonBody` and the generate-image validation
throws to it (or have `handleError`/a small wrapper translate `HttpError` into the canonical shape
for `/api/*`), and extend `scripts/api-smoke.mjs` assertions to pin the body shape on the
400/413/415 cases. Sequence before `#567` per that issue's own recommendation.

### [Architecture] Give `authorizeGenerationRequest` one failure channel instead of three exit modes

**File(s):** `web/src/lib/server/generationAuthorization.ts` (`authorizeGenerationRequest`, lines
17–57) @ f5bf8767

**Priority:** P3

#### Problem

The function terminates through three different channels:

* returns a `GenerationAuthorization` object on success (lines 42–46, 56);
* **returns** a `Response` for throttling (lines 31, 39, 55);
* **throws** a SvelteKit `HttpError` for auth/config failures (line 34 `throw error(403, …)`, line
  41 `throw error(500, …)`).

The caller (`generate-image/+server.ts:113–118`) must know that the union return type only covers
two of the three outcomes and that a third escapes via exceptions — the signature
`Promise<GenerationAuthorization | Response>` under-describes the contract. Tests mirror the
awkwardness: some assert `result instanceof Response`, others `rejects.toMatchObject`. For a
first-time reader, the mixed convention obscures which failures are "expected flow" and which are
exceptional.

#### Proposed solution

Pick one convention. The lightest change is to throw nothing and return a discriminated union:

```ts
export type GenerationAuthorization =
  | { authorized: true; usingByok: boolean; effectiveKey: string; managedToken: string | null }
  | { authorized: false; response: Response };
```

with the 403/500 branches producing `{ authorized: false, response: json({...}, { status }) }` (or
keep `error()` throws for *both* 403/500 and throttling by throwing `HttpError`-shaped 429s — but
`throttled()` is the repo's canonical 429, so the return-based shape fits better). Tradeoff: the
route's `instanceof Response` check becomes a plain discriminant check, which is also more grepable.
Update `generationAuthorization.test.ts` accordingly.

### [Testing] `platform.ts`'s riskiest logic — `supportsOrientationLock`, `isStandalone`, `isIosDevice` — has zero unit coverage

**File(s):** `web/src/lib/platform.ts` (`supportsOrientationLock`, lines 122–126;
`TABLET_MIN_SIDE_PX`, line 88; `isStandalone`, lines 23–31; `isIosDevice`, lines 38–44),
`web/src/lib/platform.test.ts`, `web/src/lib/platform.osLabel.test.ts` @ f5bf8767

**Priority:** P3

#### Problem

The two existing test files cover only `getPlatform` (`platform.test.ts`, 28 lines) and
`osLabelFromUserAgent` (`platform.osLabel.test.ts`). Untested:

* `supportsOrientationLock()` — the most consequential function in the module. It carries a 35-line
  WHY comment (lines 79–111) explaining a subtle iPadOS-26 windowing heuristic and a named tuning
  constant `TABLET_MIN_SIDE_PX = 600`, and it gates whether orientation toggles are shown *and*
  whether `applyDeviceOrientationPreference` does anything at all (`orientation.ts` line 21). The
  `< 600` boundary, the "web always true", the "SSR false", and the "native tablet false / native
  phone true" branches are all unasserted; a regression (e.g. flipping `<` to `<=` or reading window
  instead of screen) would ship silently.
* `isStandalone()` — four OR'd display-mode probes including the iOS-legacy `navigator.standalone`;
  drives PWA-vs-tab classification in `deviceInfo.ts` and fullscreen affordances.
* `isIosDevice()` — the iPadOS-masquerading-as-Mac branch (`MacIntel` + `maxTouchPoints > 1`) is
  exactly the kind of clever check that dies quietly.

These are pure, cheaply mockable functions (`globalThis.Capacitor` stubbing is already demonstrated
in `platform.test.ts`; `matchMedia`/`screen` stubs via `vi.stubGlobal` are demonstrated in
`idle.test.ts`).

#### Proposed solution

Extend `platform.test.ts` (happy-dom env) with table-driven cases: `supportsOrientationLock` at
screen min-sides 599/600/601 for native vs web vs SSR (stub `globalThis.Capacitor.isNativePlatform`
and `window.screen` width/height getters); `isStandalone` for each display-mode query plus the
`navigator.standalone` legacy path; `isIosDevice` for iPhone UA, plain-Mac UA (false), and touch-Mac
(true). Keep `osLabel` in its node-env sibling file as-is.

### [Performance] Pinch move path allocates per pointermove, against the repo's hot-path rule

**File(s):** `web/src/lib/actions/pinchZoom.svelte.ts` (`centroid` lines 54–62, `recompute` lines
89–108, `local` lines 169–172) @ f5bf8767; `web/src/lib/actions/spreadTracker.ts` (`points()` lines
20–22)

**Priority:** P4

#### Problem

The svelte rule file is explicit that gesture trackers are hot paths: "code reached per pointermove
… must not allocate arrays/objects". Each `pinchZoom` move allocates: `tracker.points()` builds a
fresh array (twice per move — `recompute` line 91 and inside `centroid`'s caller), `centroid`
returns a new object, `local` returns a new `Point`, `recompute` builds a new transform object, and
`apply` builds a template string. A prior commit (f3faf52) already removed one such allocation from
`spread()`, so the codebase treats this path as worth tightening; the remaining ones are the same
class. In fairness this runs only while pinching the AI preview (not while drawing), so the
practical stakes are modest — but the stated rule draws no such distinction, and the fix is cheap.

Secondary: the `rect ?? node.getBoundingClientRect()` fallbacks (lines 165, 171) are defensive
lazy-init on the move path — unreachable in practice (`rect` is always set by the `pointerdown` that
made `pointerCount > 0`), which the hot-path rule also calls out.

#### Proposed solution

Give the tracker a non-allocating iteration surface (e.g. `forEach(cb)` or reused first/second
accessors — it already has an allocation-free `spread()`); compute the centroid with a running sum
over that; reuse a scratch `Point`/transform object in `recompute`. Replace the `??` fallbacks with
a direct `rect!`-free structure: snapshot `rect` in `onPointerDown` and pass width/height/left/top
through the closure invariant (a comment stating the invariant beats a silent re-measure). Verify
with `npm run perf:*` only if the drawing path is ever routed through this tracker; otherwise a
before/after allocation check in DevTools is enough.

## Safety, resource, and ships-to-production

Unbounded work, unvalidated input reaching a shell, unpinned remote code, and files that reach the
production bundle or the clone weight without being needed there.

### [Performance] `generate-image` buffers up to 15 MB before rejecting an unsupported Content-Type on the raw path

**File(s):** `web/src/routes/api/generate-image/+server.ts` (`POST`, lines 120–125; raw
`readValidatedImage`, lines 77–84) @ f5bf8767

**Priority:** P4

#### Problem

On the raw-body contract the MIME type is known from the header before any body byte is read
(`contentTypeOf(request)`, line 82), yet the allowlist check runs only after `readValidatedImage()`
has buffered the full body:

```ts
const { bytes: inputBytes, mimeType } = await source.readValidatedImage();
// An empty type is fine (default to PNG below); only reject a type that's
// present and not on the allowlist.
if (mimeType && !ALLOWED_IMAGE_TYPES.includes(mimeType)) {
  throw error(415, 'Unsupported image type');
}
```

A credentialed caller posting 15 MB of `application/octet-stream` costs a full buffer + copy on the
single synchronous Netlify function (the memory/DoS scenario `MAX_IMAGE_BYTES`'s own comment worries
about) before the cheap header check rejects it. The multipart path can't avoid buffering
(credentials live in the body), but the raw path — the current contract — can.

#### Proposed solution

Move the allowlist check inside each `readValidatedImage` thunk: the raw thunk checks
`contentTypeOf(request)` *before* `readBodyWithinLimit`; the multipart thunk checks `imageFile.type`
after the (unavoidable) parse. This also relocates the 415 beside the 413/400 it belongs with.
Gotcha: the raw path's status for "oversized AND unsupported" flips from 413 to 415 — update the
api-smoke expectation if it pins that combination (it currently only pins the multipart 415 case).

### [Performance] Service-worker precache includes assets the app never fetches (social og:image, generator source SVGs)

**File(s):** `web/vite.config.ts` (`workbox.globPatterns`, line 105) @ f5bf8767

**Priority:** P3

#### Problem

`globPatterns: ['**/*.{js,css,ico,png,svg,webp,mp3,woff2,webmanifest}']` (line 93) sweeps everything
in the build output — including `static/` files that only exist for *external* consumers and are
never requested by the running app:

* `web/static/large-image.png` (556,002 bytes) — referenced only by `og:image`/`twitter:image` meta
  in `web/src/app.html:32,41`; fetched by link-unfurling scrapers, never by a browser session.
* `web/static/large-image.svg` (7,497 bytes) — input file for `scripts/gen-large-image.mjs:32`, not
  a runtime asset.
* `web/static/styles/source.svg` (55,652 bytes) — input for
  `tools/asset-gen/bin/gen-style-covers.mjs:21`, not a runtime asset.

That is ~620 KB of precache downloaded by every client that installs the SW, on top of the ~39 MB
the config already frets about ("a window.load registration would saturate a slow connection", lines
76–81). The config already demonstrates deliberate precache curation (`navigateFallback: ''`, html
excluded) — these files just slipped through the glob.

#### Proposed solution

Add `globIgnores: ['large-image.png', 'large-image.svg', 'styles/source.svg']` beside `globPatterns`
(workbox supports it at the same level), with a WHY comment ("social-card + generator inputs —
served, never fetched by the app"). If the generator-input SVGs move out of `static/` entirely (see
the next finding), only `large-image.png` needs ignoring. Verify by inspecting the emitted `sw.js`
precache manifest after `npm run build`.

### [Architecture] Generator input files live in web/static and ship to production

**File(s):** `web/static/large-image.svg`, `web/static/styles/source.svg` @ f5bf8767

**Priority:** P3

#### Problem

Both SVGs are *inputs* to offline tooling, not app assets: `scripts/gen-large-image.mjs:32` reads
`web/static/large-image.svg` to replay strokes onto the live canvas, and
`tools/asset-gen/bin/gen-style-covers.mjs:21` reads `web/static/styles/source.svg` to generate the
style-cover webps. Neither is referenced by any runtime code path (only `scripts/image-audit.mjs:34`
— which has to special-case both in its `IGNORE` set precisely because they aren't app images).
Housing tool inputs in the production publish directory means they are served publicly, copied into
the native binaries, and precached (previous finding), and it muddies the otherwise-clean rule that
`static/` is "the files meant to be served verbatim" (`web/netlify.toml:16-17`).

#### Proposed solution

Move `large-image.svg` beside its consumer (e.g. `scripts/assets/large-image.svg`) and `source.svg`
into `tools/asset-gen/` (its docs at `tools/asset-gen/docs/README.md:142` already describe it as a
committed pipeline input). Update the two generator paths and drop both entries from
`scripts/image-audit.mjs`'s `IGNORE` set. Gotcha: confirm neither URL is referenced externally
(nothing in-repo fetches them over HTTP).

### [Correctness] `install-maestro` pipes an unpinned remote script to bash and never verifies the pin took effect

**File(s):** `.github/actions/install-maestro/action.yml` (lines 7–13) @ f5bf8767

**Priority:** P3

#### Problem

```yaml
- name: Install Maestro CLI
  shell: bash
  env:
    MAESTRO_VERSION: 2.4.0
  run: |
    curl -fsSL "https://get.maestro.mobile.dev" | bash
    echo "$HOME/.maestro/bin" >> "$GITHUB_PATH"
```

This is the one place in `.github/` that executes remote code without a pin: every external action
is SHA-pinned (and `scripts/tests/workflow-hygiene.test.mjs` enforces exactly that, rejecting any
`uses:` ref not ending in a 40-char SHA), yet whatever `get.maestro.mobile.dev` serves at run time
executes verbatim on the runner. The `MAESTRO_VERSION` env var pins the CLI *only if* the remote
script continues to honor that variable — if upstream renames it, the step silently installs latest,
and the action's own description ("Install the pinned Maestro CLI version") becomes false with no
failing signal. Both release-tag deploy smokes (`android-deploy.yml` line 55, `ios-deploy.yml`
line 32) depend on it at the most sensitive moment in the pipeline.

#### Proposed solution

Two independent, cheap hardenings:

1. **Assert the pin took:** after install, fail loudly on drift —
   ```bash
   installed="$("$HOME"/.maestro/bin/maestro --version 2>/dev/null | head -1)"
   [[ "$installed" == *"$MAESTRO_VERSION"* ]] || { echo "::error::Maestro $installed != pinned $MAESTRO_VERSION"; exit 1; }
   ```
2. Optionally, fetch the install script from Maestro's GitHub repo at a tagged ref (or vendor the
   ~30-line script into `.github/actions/install-maestro/`) so the executed bytes are pinned the
   same way every `uses:` ref already is.

Tradeoff: vendoring means occasionally refreshing the script; the version assertion alone converts
"silently wrong version" into a red job, which is most of the value.

### [Correctness] The E2E spec sanitizer admits leading-dash values and `..` traversal

**File(s):** `scripts/audit-burndown/burndown.mjs` (lines 701–707, 517–524) @ f5bf8767

**Priority:** P4

#### Problem

```js
const e2eSpecs = (verify.structured.e2e_specs ?? []).filter(
  (spec) => typeof spec === 'string' && /^[\w./-]+$/.test(spec),
);
```

The comment says "Sanitize hard: these strings are LLM-authored and reach a shell" — and the class
does block shell metacharacters. But `-` and `.` are in the class unanchored, so `--grep-invert`,
`-x`, or `../../something.spec.ts` all pass and are joined straight into the shell command at line
362 (``runGate(`${E2E_CMD} ${specs.join(' ')}` …)``). A verifier that emits a flag-shaped "spec"
silently changes Playwright's behavior for the gate (e.g. inverting the filter), which corrupts the
gate's verdict rather than failing loudly. The verifier prompt says specs are "paths relative to
web/, e.g. `tests/flows.spec.ts`" (verifier.md lines 51–52) — the sanitizer should encode that
shape.

#### Proposed solution

Tighten to the documented shape:

```js
const E2E_SPEC_SHAPE = /^tests\/[\w/-]+\.(spec|test)\.ts$/;
```

or minimally reject `spec.startsWith('-')` and `spec.split('/').includes('..')`. Log rejected values
(currently they vanish silently) so a misbehaving verifier is visible in run.log.

### [Correctness] overnight.mjs neither validates the count argument nor shell-quotes it

**File(s):** `scripts/audit-burndown/overnight.mjs` (lines 24, 51–52) @ f5bf8767

**Priority:** P3

#### Problem

```js
const count = process.argv[2] ?? '600';
…
const envPrefix = [`MAX_ISSUES=${count}`, ...forwarded].join(' ');
const cmd = `env ${envPrefix} node scripts/audit-burndown/burndown.mjs`;
```

Two defects:

1. **No validation.** `npm run audit:burndown:overnight -- 6OO` (typo) launches a detached job whose
   `Number('6OO')` is `NaN`; burndown's `while (done < MAX_ISSUES)` (line 513) is instantly false,
   so the run preflights green, detaches, prints the launch banner… and exits having done nothing,
   with only a `finished: 0 fixed` line in a log nobody is watching. scripts/CLAUDE.md requires:
   "validate inputs up front with a path-specific one-line error and a non-zero exit."
2. **Inconsistent quoting.** Every forwarded knob goes through `shellQuote` (line 48) but `count` is
   interpolated raw into a `shell: true` spawn (line 55). Operator-supplied, so not a security hole
   in practice, but an argument containing a space or metachar corrupts the command line silently
   instead of failing loudly.

The same `Number(...)`-NaN silence applies to `MAX_ISSUES`/`MAX_HANDLED`/etc. inside burndown.mjs
itself (lines 76–111), but the launcher is where a human types the value.

#### Proposed solution

```js
const count = process.argv[2] ?? '600';
if (!/^\d+$/.test(count) || Number(count) < 1) {
  console.error(
    `overnight: finding count must be a positive integer, got ${JSON.stringify(count)}`,
  );
  process.exit(2);
}
```

and `MAX_ISSUES=${shellQuote(count)}` in the prefix for symmetry with the forwarded knobs.

### [Correctness] android-emulator-smoke boot wait can spin forever and crashes opaquely when no serial matches

**File(s):** `scripts/android-emulator-smoke.mjs` (lines 70–73) @ f5bf8767

**Priority:** P3

#### Problem

```js
await Promise.race([adb('wait-for-device'), emulatorCrash]);
while ((await adb('shell', 'getprop', 'sys.boot_completed')) !== '1') await sleep(2000);
emulatorProc.unref();
const serial = (await adb('devices')).match(/emulator-\d+/)[0];
```

Three issues:

1. The `getprop sys.boot_completed` loop (line 71) has no timeout. A boot that hangs (the exact
   hardware-accel misconfiguration this script preflights for at lines 25–38 is not the only way an
   emulator wedges) leaves `npm run test:android` spinning silently forever. `scripts/CLAUDE.md`
   says explicitly: "name polling budgets". The repo already has
   `pollUntil(callback, timeoutMs, intervalMs)` in `scripts/lib/proc.mjs` (lines 82–91) built for
   precisely this.
2. The `emulatorCrash` race only guards `wait-for-device` (line 70); the boot-completed loop and
   `adb devices` call are outside it. (A hard crash usually makes `adb` reject so the failure
   surfaces, but a crash that leaves adb responsive with no device does not.)
3. `.match(/emulator-\d+/)[0]` (line 73) throws a bare `TypeError: Cannot read properties of null`
   when no emulator serial appears — an opaque failure at the exact moment something already went
   wrong.

#### Proposed solution

Name a budget and use the existing helper:

```js
const BOOT_TIMEOUT_MS = 300_000; // cold emulator boot on CI-class hardware
const BOOT_POLL_INTERVAL_MS = 2_000;
const booted = await pollUntil(
  async () => (await adb('shell', 'getprop', 'sys.boot_completed')) === '1',
  BOOT_TIMEOUT_MS,
  BOOT_POLL_INTERVAL_MS,
);
if (!booted) throw new Error(`Emulator did not finish booting within ${BOOT_TIMEOUT_MS / 1000}s`);
```

For the serial, guard the match:
`const serial = (await adb('devices')).match(/emulator-\d+/)?.[0]; if (!serial) throw new Error('No emulator serial in adb devices output');`.

### [Maintainability] `dev:kill` executes `kill-port` via bare `npx` — an undeclared, unpinned dependency fetched at run time

**File(s):** `package.json` (line 16) @ f5bf8767

**Priority:** P4

#### Problem

```json
"dev:kill": "npx kill-port 5173 8888",
```

`kill-port` is not in `devDependencies` (only `tree-kill` exists in `node_modules/.bin`), so `npx`
resolves it from the registry on each first use: the script needs network to run (it exists
precisely for when the local environment is wedged), executes whatever version is `latest` that day,
and is exposed to registry-side supply-chain swaps. The repo's own ESLint config bans the bare
`playwright` import specifically because "bare playwright is an undeclared transitive dependency"
(eslint.config.js lines 60–65) — the same principle applies to tooling invoked from scripts.

#### Proposed solution

Either pin it as a devDependency (`"kill-port": "^2"`) so `npx` resolves the local, locked copy — or
drop the dependency entirely with a tiny Node helper in `scripts/` (consistent with ADR-0017's
"platform-specific tools are invoked via Node helpers"): find the PID listening on 5173/8888 via
`lsof -ti :5173` / reading `/proc` and `process.kill` it. The helper route also removes the one
remaining scripted network dependency for a purely local operation.

### [Maintainability] Prune the full-resolution working-set images committed under ideas-exploration (~34 MB)

**File(s):** `tools/asset-gen/ideas-exploration/idea-16/work/` (~14 MB),
`tools/asset-gen/ideas-exploration/idea-15/{hotspots,compare,img,regionmean}/` (~11 MB, 285 PNGs),
plus smaller sets in `idea-18/work/`, `idea-2/`, `idea-12/img/` @ f5bf8767

**Priority:** P2

#### Problem

`ideas-exploration/` weighs 63 MB. Its own README (lines 122–129) defines the per-idea contract:
`report.md`, `meta.json`, `code/`, and "`*.webp` … before/after evidence (≤560 px)". But several
ideas committed their entire full-resolution working sets wholesale:

* `idea-16/work/` — 14 MB of full-res takes and composites for an idea whose Status is **NOT
  PROMOTED**; the decisive evidence is already inlined at 480 px (report line 156–162 names the
  ≤480px webp files and then says "Full-resolution takes and all composites are in `work/`").
* `idea-15/` — 12 MB for another **NOT PROMOTED** idea: four image dirs (`hotspots/`, `compare/`,
  `img/`, `regionmean/`) full of uncompressed PNGs (285 PNGs totalling 29 MB across the folder vs 13
  MB for all 416 webps).
* A scripted cross-check found 442 image files (~34 MB) referenced by neither any `meta.json` (what
  `build-review.mjs` inlines into the dashboard) nor individually by any `report.md` — they are
  covered at best by a directory-level "everything else is in work/" sentence.

This is committed R&D scratch, so the bar is "dead weight worth pruning": every clone, and every
future `git` operation, carries 30+ MB of full-res exploration outputs whose conclusions are already
captured in the ≤560 px evidence, the reports, and the 5 MB dashboard.

#### Proposed solution

For each idea, keep exactly what the README contract promises — the report, meta.json, code, and the
small webp evidence the report/meta reference — and delete the wholesale full-res dirs (or, where a
dir genuinely earns its keep, downsize to ≤560 px webp like the rest of the folder). `idea-16/work/`
and `idea-15/`'s three of four PNG dirs are the big wins. Update the affected reports' "evidence
files" sections in the same commit. Gotcha: history still carries the bytes — that's acceptable; the
goal is checkout/clone weight and honoring the folder's own layout contract, not history rewriting.

### [Maintainability] idea-21 carries 12.6 MB of regenerable proof-sheet HTML for a LANDED feature

**File(s):** `tools/asset-gen/ideas-exploration/idea-21/farm-compare-46bc770.html` (6.9 MB),
`idea-21/farm-git-46bc770.html` (5.7 MB); smaller: `owl-tall-compare-34a606f-prerename.html`,
`owl-tall-compare-6e3f14f.html` @ f5bf8767

**Priority:** P3

#### Problem

Idea 21's Status is LANDED: `--source git:<ref>` is now a first-class mode of
`bin/gen-coloring-book-proof-sheet.mjs` (report line 3). The folder nonetheless commits four
self-contained demo sheets, two of them whole-category farm sheets at ~6–7 MB each — 12.6 MB, the
single largest weight in `ideas-exploration/` (15 MB total). Unlike NOT-PROMOTED evidence, these
prove nothing that can't be reproduced in ~3 s offline by the shipped tool
(`npm run gen:coloring-book-proof-sheet -- farm --source git:46bc770`); the small `pair-*.webp`
crops and `overview-owl-compare.webp` already document the outcome visually. The repo also has a
designated home for keeper run outputs — `/scrapbook` (ADR-0059) — and these aren't published there
either; they're dead bytes in a frozen R&D folder.

#### Proposed solution

Delete the four HTML sheets (certainly the two farm ones) and let the report's "how to reproduce"
line plus the committed webp crops carry the record; update `idea-21/report.md` and the folder
README's layout note ("idea-21 carries generated comparison sheets") in the same commit. If one
exemplar sheet is genuinely worth keeping browsable, publish the smallest owl sheet via
`npm run scrapbook:publish` instead of storing it here.

## Cross-file agreement held by prose

CLAUDE.md is explicit that a "keep in sync with X" comment marks a defect rather than a mitigation.
Kept only where the two sides can diverge *silently* and ship — release versions, ESLint's paired
restricted-import blocks, policy values re-declared in specs. One of these has already drifted.

### [Testing] Version numbers must agree across three files but have no at-rest drift guard

**File(s):** `android/app/build.gradle` (lines 28–29) · `ios/App/App.xcodeproj/project.pbxproj`
(lines 311, 318, 333, 340) · `package.json` (line 3) @ f5bf8767

**Priority:** P3

#### Problem

The same release identity lives in three places: `package.json:3` (`"version": "1.4.0"`),
`android/app/build.gradle:28–29` (`versionCode 6`, `versionName "1.4.0"`), and
`ios/App/App.xcodeproj/project.pbxproj` (`CURRENT_PROJECT_VERSION = 6;` at 311/333,
`MARKETING_VERSION = 1.4.0;` at 318/340). `scripts/release.mjs` (`bumpVersions`, lines 102–111)
writes all three in one transaction, and `android/CLAUDE.md` warns "Don't hand-edit
versionCode/versionName".

But the repo convention (root `CLAUDE.md`, "Cross-file agreement is never maintained by prose")
requires a drift-guard test when agreeing sites can't share code — exactly the situation here
(Groovy, pbxproj, JSON). The existing tests don't cover it: `scripts/tests/native-version.test.mjs`
reads both real files but only asserts the bump transforms are idempotent per file ("is
byte-identical when re-applying the committed version", lines 28–32 and 78–82) — it never compares
Android's committed version to iOS's or to `package.json`'s. A hand edit (or a partially applied
release script run, e.g. killed between `setAndroidVersion` and `setIosVersion`) desyncs the stores'
versions and nothing goes red until store submission.

#### Proposed solution

Add an at-rest agreement suite to `scripts/tests/native-version.test.mjs` (the file already loads
both real sources):

```js
describe('committed native versions agree', () => {
  it('android versionName === ios MARKETING_VERSION === package.json version', ...);
  it('android versionCode === ios CURRENT_PROJECT_VERSION', ...);
});
```

Parse with the same strict regexes the bump code uses (export them from
`scripts/lib/native-version.mjs` rather than duplicating). pbxproj carries each key twice (Debug +
Release); assert all occurrences are identical, not just the first match.

### [Testing] The `scripts` ↔ `scripts-info` contract (ADR-0019) has no drift guard

**File(s):** `package.json` (lines 8–165 vs 166–323) @ f5bf8767

**Priority:** P3

#### Problem

CLAUDE.md's command section states the contract: "every new or renamed script gets a matching
one-line entry in the `scripts-info` block". With 126 scripts and 126 descriptions maintained as two
parallel JSON objects, that agreement is currently kept purely by discipline — nothing fails when a
script is added without a description or a description is orphaned by a rename. (Today the key sets
happen to match exactly; the *ordering* has already drifted — first divergence at index 68,
`gen:shots` vs `gen:style-covers` — showing the two blocks are in fact edited independently.) The
repo convention says exactly this situation gets a drift-guard test, and `scripts/tests/` already
hosts the analogous guards (`workflow-hygiene.test.mjs`, `labels.test.mjs`,
`claude-permissions.test.mjs`).

#### Proposed solution

Add `scripts/tests/scripts-info.test.mjs` (runs under the existing `test:scripts` tier):

```js
const { scripts, 'scripts-info': info } = JSON.parse(readFileSync(pkgPath, 'utf8'));
it('every script has a scripts-info entry', () =>
  expect(Object.keys(scripts).filter((k) => !(k in info))).toEqual([]));
it('every scripts-info entry has a script', () =>
  expect(Object.keys(info).filter((k) => !(k in scripts))).toEqual([]));
```

Optionally assert matching key order so the two blocks read in parallel; that's a style choice — the
presence checks are the load-bearing part.

### [Maintainability] CI retry-token derivation formula is duplicated between playwright.config.ts and the spec that consumes it

**File(s):** `web/playwright.config.ts` (`ciAllowedTokens`, lines 143–146) @ f5bf8767

**Priority:** P2

#### Problem

`web/playwright.config.ts:64-67` derives the per-retry token list served to the web server:

```ts
const ciRetries = 2;
const ciAllowedTokens = Array.from(
  { length: ciRetries + 1 },
  (_, retry) => retry === 0 ? 'daycare-club' : `daycare-club-retry${retry}`,
).join(',');
```

and `web/tests/generate-image.spec.ts:112` re-derives the identical formula independently:

```ts
const token = testInfo.retry === 0 ? 'daycare-club' : `daycare-club-retry${testInfo.retry}`;
```

Two hand-maintained copies of the same string-construction rule. If either side changes (rename the
base token, change the suffix scheme), the other keeps compiling and the breakage only manifests
**on a CI retry** — the rarest, least-debuggable path, and precisely the situation the retry tokens
exist to handle (rate-limit buckets per retry). CLAUDE.md's boundary-string rule ("declared once,
imported everywhere") excepts *tests* re-typing literals, but here the non-test config side and the
spec each derive a *formula*, not a literal — the derivation itself is the shared contract.

#### Proposed solution

Extract `export function retryScopedToken(retry: number): string` (plus
`export const CI_MANAGED_TOKEN = 'daycare-club'`) into a small shared module, e.g.
`web/tests/ai-tokens.ts`, imported by both `playwright.config.ts` (which already imports from
`./tests/admin-helpers`, so the precedent exists) and `generate-image.spec.ts`. `ciAllowedTokens`
becomes `Array.from({ length: ciRetries + 1 }, (_, r) => retryScopedToken(r)).join(',')`.

### [Maintainability] `COLOR_CHANGE_DEBOUNCE_SETTLE_MS` keeps cross-file agreement with the engine by prose, not import

**File(s):** `web/tests/helpers.ts` (lines 29–30) and `web/src/lib/drawing/engine.ts`
(`COLOR_CHANGE_DEBOUNCE_MS`, line 795) @ f5bf8767

**Priority:** P2

#### Problem

`web/tests/helpers.ts:27-28` is a textbook instance of the pattern CLAUDE.md calls a defect ("A
'keep in sync with X' comment marks a defect, not a mitigation"):

```ts
// Must remain greater than the engine's COLOR_CHANGE_DEBOUNCE_MS (100).
export const COLOR_CHANGE_DEBOUNCE_SETTLE_MS = 150;
```

The engine's constant is module-private (`web/src/lib/drawing/engine.ts:702`:
`const COLOR_CHANGE_DEBOUNCE_MS = 100;`), so the agreement is maintained only by this comment —
which also restates the mutable value `(100)`, a second convention violation ("no restating mutable
facts … owned elsewhere"). If the engine debounce is ever raised past 150 ms, every spec that sleeps
`COLOR_CHANGE_DEBOUNCE_SETTLE_MS` (`flows-magic-brush.spec.ts:438`,
`flows-palette-brush.spec.ts:70`, `engine-pointer-recovery.spec.ts:63`) starts flaking or silently
testing inside the debounce window, with nothing failing loudly to point at the drift.

The suite already imports engine constants directly — `engine-pointer-recovery.spec.ts:3-9` imports
`EDGE_SWIPE_BAND_PX`, `POINTER_RESUME_GAP_MS`, etc. from `$lib/drawing/strokeMath` — so the import
path is proven.

#### Proposed solution

Export the constant from a side-effect-free module (either export it from `engine.ts` if importing
it doesn't drag in import-time side effects for the Playwright Node context, or move it to
`$lib/drawing/strokeMath.ts` beside the other pointer-timing constants and have `engine.ts` import
it). Then derive the settle value:

```ts
import { COLOR_CHANGE_DEBOUNCE_MS } from '$lib/drawing/strokeMath';
export const COLOR_CHANGE_DEBOUNCE_SETTLE_MS = COLOR_CHANGE_DEBOUNCE_MS + 50;
```

Gotcha: `engine.ts` touches DOM at module scope in places — verify it imports cleanly under
Playwright's Node transform before choosing it as the export home; `strokeMath.ts` is the safe host
(it is already imported by a spec today).

### [Maintainability] `generate-image.spec.ts` re-declares server policy values (rate limits, upload cap) instead of importing them

**File(s):** `web/tests/generate-image.spec.ts` (lines 20–23, 43–44) @ f5bf8767

**Priority:** P2

> **Verified 2026-07-28** — `rateLimitPolicy.ts` is side-effect-free and `admin.spec.ts` line 2
> already imports a server module by relative path, so the proposed import is proven viable.
> Citation correction: the constants are on lines 19–20 (line 18 is the comment).

#### Problem

The testing rule says "Parametrized tests import the constant/manifest they exercise — never
re-declare the value." This spec re-declares three server policy values:

```ts
// Mirrors of generateToken / generateByok in src/lib/server/rateLimitPolicy.ts.
const GENERATE_LIMIT = 15;
const BYOK_LIMIT = 30;
```

(lines 19–21), and line 42 hard-codes the upload cap's neighbor:

```ts
// 16 MB — just over the 15 MB cap.
const tooBig = Buffer.alloc(16 * 1024 * 1024);
```

where the cap is `MAX_IMAGE_BYTES = 15 * 1024 * 1024` — a module-private const at
`web/src/routes/api/generate-image/+server.ts:25`.

`rateLimitPolicy.ts` is side-effect-free and exports `rateLimitPolicy.generateToken.limit` /
`.generateByok.limit`, and the same spec directory already imports server modules (`admin.spec.ts:2`
imports `SECURITY_HEADERS` from `../src/lib/server/securityHeaders`). If someone tunes a limit, the
burst tests fail with a confusing throttle mismatch instead of tracking the source; the "Mirrors
of…" comment is exactly the prose-sync pattern the conventions ban.

#### Proposed solution

```ts
import { rateLimitPolicy } from '../src/lib/server/rateLimitPolicy';
const GENERATE_LIMIT = rateLimitPolicy.generateToken.limit;
const BYOK_LIMIT = rateLimitPolicy.generateByok.limit;
```

For the upload cap, export `MAX_IMAGE_BYTES` from the `+server.ts` (the server rules already
sanction exporting contract values from `+server.ts` files) and use
`Buffer.alloc(MAX_IMAGE_BYTES + 1)`. Gotcha: confirm the `+server.ts` imports cleanly in the
Playwright Node context (it imports the AI provider seam); if it doesn't, move the cap into a small
`generateImagePolicy.ts` module the route imports.

### [Maintainability] Crayon stage vocabulary triplicated — and the samples.mjs copy already drifted (missing stage 6)

**File(s):** `tools/asset-gen/crayon-brush-samples/samples.mjs` (header lines 1–10, stage arrays
through line 174), `build-sheet.mjs` (`STAGES`, lines 26–57), `README.md` (table lines 16–23) @
f5bf8767

**Priority:** P4

#### Problem

The stage list (prefix → name → what it pins down) exists three times: the README table,
`build-sheet.mjs`'s `STAGES` array, and `samples.mjs`'s header comment. The comment has already
drifted — it enumerates stages 1–5:

```js
// Reference sample specs for the crayon brush mode. Grouped in progressive
// stages so the set can be generated and reviewed incrementally:
//   1-  single lines (one crayon stroke per color)
//   …
//   5-  fills & swatches (area coverage, texture at a glance)
```

while the file itself defines `stage6` (macro close-ups, lines 160–172) and exports it in `SAMPLES`
(line 174), and the README/build-sheet both list six stages. This is the exact drift class the root
conventions call out (comments restating facts owned elsewhere; cross-file agreement by prose).

#### Proposed solution

Make `samples.mjs` the single owner: export a `STAGES` array (`[{ prefix, heading, blurb }]`) beside
`SAMPLES`, import it in `build-sheet.mjs`, and cut the header comment's stage enumeration down to
"grouped in progressive stages — see STAGES". The README table stays as human prose but then has one
code source to check against.

### [Maintainability] The supported Node floor (engines 22.13) is never exercised — CI hardcodes Node 24 with no tie to `engines`

**File(s):** `.github/actions/setup-node/action.yml` (line 19); `package.json` (lines 5–7);
`docs/CONTRIBUTING.md` (line 14) @ f5bf8767

**Priority:** P3

#### Problem

The Node version is stated independently in at least four places with three different values:

* `package.json` engines: `"node": ">=22.13"` (line 6)
* `.github/actions/setup-node/action.yml`: `node-version: 24` (line 19) — every CI job (quality,
  tests, both deploy smokes, blobs smoke) runs on 24
* `docs/CONTRIBUTING.md` line 14: "**Node 22** via nvm" (22.0 does not satisfy engines). This was
  `README.md` line 39, "Node.js 22+ and npm", at 9ae62ff1; the README's prerequisites moved into the
  contributing guide before f5bf8767 and the version claim moved with them.
* `.codex/cloud/setup.sh`: 22.12 (previous finding)

Meanwhile the production Netlify build pins no `NODE_VERSION` in `netlify.toml`, so it runs
Netlify's platform default (a 22.x LTS). Net effect: **CI validates the whole suite on Node 24, but
the deploy — and the declared minimum — run on 22.x, which CI never touches.** A dependency or
script using an API that exists in 24 but not in 22.13 (the `--experimental-strip-types` behavior
itself differs across these majors) goes green in CI and breaks only at deploy or on a floor-version
dev machine. There is no comment in `action.yml` explaining why 24 was chosen over the floor, and no
drift guard connecting any of these sites — the repo's own convention says cross-file agreement is
kept by an imported constant or a drift-guard test, never prose.

#### Proposed solution

Pick one deliberate policy and encode it:

* Cheapest: point CI at the floor via `node-version-file: package.json` (setup-node resolves
  `engines.node`), so CI always tests the version the repo promises to support, and bumping the
  floor is a one-line `engines` edit. If testing the latest major is also wanted, that's a matrix
  decision worth a comment.
* If staying on a hardcoded 24 (e.g. "test what developers actually run"), add the WHY comment in
  `action.yml` and a drift-guard case in `scripts/tests/workflow-hygiene.test.mjs` asserting
  `node-version` ≥ the `engines` floor, so a future engines bump can't silently overtake CI.

Fix `docs/CONTRIBUTING.md`'s "Node 22" to match `engines` (or reword to "the version in package.json
`engines`" so it can't drift again).

### [Testing] Android minSdk floor ↔ COMPATIBILITY.md agreement is maintained by prose

**File(s):** `android/variables.gradle` (line 2) · `scripts/tests/android-config.test.mjs` (lines
14–29) @ f5bf8767

**Priority:** P4

#### Problem

`docs/COMPATIBILITY.md` names `android/variables.gradle → minSdkVersion` as the authoritative source
of the "Android 7.0 / API 24+" support floor (its lines 18, 34–36, 52) and repeats "API 24" in
several risk-register rows. The iOS side of the same table got a real drift guard —
`web/src/browserFloor.test.ts` parses `IPHONEOS_DEPLOYMENT_TARGET` out of the pbxproj and compares
it against `BROWSER_TARGETS`. The Android side has none: `scripts/tests/android-config.test.mjs`
deliberately scopes its patterns to the *emulator* API level ("the API 24 minSdk floor … don't
false-positive", lines 22–24), so nothing fails if `minSdkVersion = 24` (`variables.gradle:2`) is
raised while COMPATIBILITY.md, the store listing floor, and the Maestro floor-run issues (\#483)
still say 24. Per the cross-file-agreement convention this is exactly the drift-guard-test case.

#### Proposed solution

Add a `describe('Android support floor single source')` block to `android-config.test.mjs`: parse
`minSdkVersion = (\d+)` from `android/variables.gradle`, and assert the contextual "API 24"/"Android
7.0 / API 24+" phrases in `docs/COMPATIBILITY.md` (and `.ruler/skills/mobile/android.md` if it
states the floor) match. Use the same allowlist + context-anchored-pattern approach the file already
established for the emulator level, so historical docs stay exempt.

### [Maintainability] `version.json` boundary string is declared in two places (emitter and fetcher)

**File(s):** `web/vite.config.ts` (`emit-version-json` plugin, line 74) @ f5bf8767

**Priority:** P3

#### Problem

The build emits the version endpoint at `vite.config.ts:63` (`fileName: 'version.json'`) and the app
fetches it at `web/src/lib/pwa/updates.ts:140`
(`await fetch('/version.json', { cache: 'no-store' })`). CLAUDE.md's rule for boundary strings —
"declared once, imported everywhere (tests deliberately excepted)" — applies squarely: both sides
are production code, and both *can* share a constant (vite.config.ts already imports sibling TS
modules, and Vite bundles the config with esbuild, so importing a side-effect-free module from
`src/` works). Today a rename on either side deploys cleanly and only fails at runtime as a
silently-dead stuck-client recovery path (updates.ts swallows the failed fetch at lines 148–150 by
design).

#### Proposed solution

Create a tiny constants module, e.g. `web/src/lib/pwa/versionEndpoint.ts` exporting
`export const VERSION_JSON_FILENAME = 'version.json';` (and optionally
`VERSION_JSON_PATH = '/' + VERSION_JSON_FILENAME`). Import it in both `vite.config.ts` and
`updates.ts`. Keep the module side-effect-free (no browser globals at top level) so the node-side
config import stays safe. The `updates.test.ts` literals (lines 131, 139) stay as literals per the
tests exception.

### [Maintainability] ESLint keeps two `no-restricted-imports` blocks in sync by comment instead of a shared constant

**File(s):** `eslint.config.js` (lines 57–72 and 144–169) @ f5bf8767

**Priority:** P3

#### Problem

Because flat-config rule entries replace rather than merge, the repo-wide `playwright` import ban
must be restated inside the `web/src` runes-convention block. Today that agreement is maintained by
a pair of warning comments:

```js
// NOTE (flat-config gotcha): a later block that configures
// no-restricted-imports REPLACES this entry — the web/src conventions block below must
// carry the playwright path too.
```

and (line 137–138) "this block must restate the repo-wide playwright ban from the root block
alongside its own paths." The `paths` entry for `playwright` — name plus message string — is
duplicated verbatim at lines 60–65 and 156–160. CLAUDE.md is explicit that "a 'keep in sync with X'
comment marks a defect, not a mitigation": whoever edits the ban's message (or adds a second
repo-wide banned import) must remember to touch both blocks, and nothing fails if they don't — the
web/src tree silently loses (or diverges from) the repo-wide ban.

The same file has a smaller triplication: the three `rateLimit` `no-restricted-syntax` selectors
(lines 83–96) differ only in `arguments.0.type` (`Literal` / `TemplateLiteral` / `BinaryExpression`)
and repeat the identical message three times.

#### Proposed solution

Hoist the shared entries to module scope and spread them:

```js
const PLAYWRIGHT_IMPORT_BAN = {
  name: 'playwright',
  message: 'Import from @playwright/test — bare playwright is an undeclared transitive dependency.',
};
```

used as `paths: [PLAYWRIGHT_IMPORT_BAN]` in the root block and
`paths: [ {…svelte/store…}, {…onDestroy…}, PLAYWRIGHT_IMPORT_BAN ]` in the web/src block. The
flat-config-replaces gotcha comment stays (it explains WHY the constant appears twice), but the
value itself can no longer fork. For the rateLimit selectors:

```js
const RATE_LIMIT_KEY_ARG_TYPES = ['Literal', 'TemplateLiteral', 'BinaryExpression'];
...RATE_LIMIT_KEY_ARG_TYPES.map((type) => ({
  selector: `CallExpression[callee.name="rateLimit"][arguments.0.type="${type}"]`,
  message: 'Build rate-limit bucket keys via src/lib/server/rateLimitKeys.ts (ADR-0014 shared-bucket contract).',
})),
```

### [Types] playwright.shared.ts config objects bypass excess-property checking when spread

**File(s):** `web/playwright.shared.ts` (`commonPlaywrightConfig` lines 6–11, `commonWebServer`
lines 55–86) @ f5bf8767

**Priority:** P3

#### Problem

Both shared objects are plain untyped literals:

```ts
export const commonPlaywrightConfig = {
  testDir: './tests',
  globalSetup: './tests/global-setup.ts',
  fullyParallel: true,
  use: { baseURL: playwrightBaseURL },
};
```

They only ever reach Playwright via spreads (`...commonPlaywrightConfig` in
`playwright.config.ts:70` and `playwright.webkit-scratch.config.ts:12`; `...commonWebServer` in the
`webServer` blocks) — and TypeScript's excess-property check does **not** apply to spread-introduced
properties. A typo'd key here (`globalSteup`, `fullyParallell`) compiles clean in every consumer and
is silently ignored by Playwright at runtime — the exact failure mode the repo's "close finite value
sets in the type" convention exists to prevent, and the setup keys govern real behavior (a dropped
`globalSetup` just makes DEV_SERVER runs flaky).

#### Proposed solution

Constrain the declarations at the source with `satisfies`:

```ts
import type { PlaywrightTestConfig } from '@playwright/test';
export const commonPlaywrightConfig = { ... } satisfies PlaywrightTestConfig;
export const commonWebServer = { ... } satisfies Partial<NonNullable<PlaywrightTestConfig['webServer']>> & { url: string };
```

`satisfies` keeps the narrow inferred type (so `use.baseURL` stays a `string` literal type for
consumers) while making unknown keys a compile error.

### [Types] `payloadStore`'s narrowed schema silently mistypes the master-key row — document or restructure the dual-schema trick

**File(s):** `web/src/lib/secureStorage.ts` (`SecureDb`/`SecretPayloadDb` lines 37–49,
`getDb`/`payloadStore` lines 64–65) @ f5bf8767

**Priority:** P4

#### Problem

The same IndexedDB store is typed two different ways: `getDb` sees `SecureDb`
(`value: CryptoKey | SecretPayload` — the truth: the store holds both the master key and secret
payloads), while `payloadStore` sees `SecretPayloadDb` (`value: SecretPayload` — a lie for the
`master-key` row):

```ts
const getDb = lazyIdbDatabase<SecureDb>(DB_NAME, STORE);
const payloadStore = idbKvStore<SecretPayloadDb>(DB_NAME, STORE);
```

The narrowing is a type assertion in module form — nothing stops `payloadStore.get(MASTER_KEY_ROW)`
from typechecking as `SecretPayload | undefined` while returning a `CryptoKey` at runtime. Today it
happens to be safe because secret names never collide with `'master-key'` and `webLoad` (line 134)
runtime-validates with `isSecretPayload` anyway — but neither the safety argument nor the reason for
two schemas is written down, in a file that otherwise explains every non-obvious decision at length.
Per the conventions, an unvalidated-looking narrow at a non-boundary needs either removal or a WHY.

#### Proposed solution

Cheapest: a two-line comment on `SecretPayloadDb`/`payloadStore` stating the contract — "same store
as SecureDb, narrowed to the secret rows; safe because secret names (`API_KEY`, `ADMIN_SESSION`)
never equal `MASTER_KEY_ROW`, and webLoad still runtime-validates" — plus noting the payoff (put()
through `payloadStore` cannot write a CryptoKey). Stronger: type `payloadStore` against `SecureDb`
and let `webLoad`'s existing `isSecretPayload` guard do the narrowing; that deletes
`SecretPayloadDb` entirely at the cost of a wider `put` signature. Either resolves the silent
mismatch; the comment route preserves the current (real) typing benefit.

## Documentation that actively misdirects

Not cosmetic doc rot. Each of these is read by an agent or a contributor *as instruction* and sends
them somewhere wrong — a source map behind the code it describes, a retired API contract, a dead
link in every generated tree, prescribed scripts that do not exist.

### [Docs] architecture skill's "file-by-file source map" and route table have drifted well behind `web/src/`

**File(s):** `.ruler/skills/architecture/SKILL.md` (source map lines 62–134, route table lines
146–161, tech-stack lines 18–19 and 55–56, `server/rateLimit.ts` row line 132) @ f5bf8767

**Priority:** P2

#### Problem

The skill advertises a "file-by-file source map of web/src/" (description, line 3) and is the
designated navigation reference, but large module families are absent or misdescribed:

* **`lib/drawing/`** — the map (lines 66–76) omits `aiImage.ts`, `aiImageResponse.ts`,
  `earlyBoot.ts` (the ADR-0072 pre-hydration boot the run-splotch skill leans on), `folderSave.ts`
  (named at line 71 as if mapped, but has no row), `magicBrush.ts`, and `perf.ts` (named at line 60
  of the profiling skill as the shared marks flag).
* **`lib/state/`** — omits `aiGeneration.svelte.ts`, `aiKey.svelte.ts`, `modal.svelte.ts`,
  `saveFolder.svelte.ts`, `ui.svelte.ts`.
* **`lib/actions/`** — lists only `dragToClear` and `modalDialog` (lines 89–90); missing
  `launchGuard`, `pinchTextZoom`, `pinchZoom`, `pointerCapture`, `scribbleGuard`, `spreadTracker`.
* **`lib/server/`** — lists five modules (lines 105–110); missing `http.ts` (the shared
  `throttled()`/`readJsonBody` helpers the api skill calls mandatory), `github.ts` (the ADR-0060
  seam), `config.ts`, `generationAuthorization.ts`, `rateLimitKeys.ts`, `rateLimitPolicy.ts`,
  `securityHeaders.ts`, `usage.ts`. The `server/rateLimit.ts` row (line 110) still reads "per-token
  rate limiting for the image generation endpoint" — it is the generic per-key sliding window
  backing seven endpoint policies in `rateLimitPolicy.ts`.
* **`lib/` top level** — no rows for `adminFormat.ts`, `aiCredential.ts`, `apiHeaders.ts`,
  `appVersion.ts`, `devHarness.ts`, `deviceInfo.ts`, `deviceReport.ts`, `errorLog.ts`, `fonts.ts`,
  `haptics.ts`, `idb.ts`, `idle.ts`, `imagePrefetch.ts`, `inviteLink.ts`, `latestRequest.ts`,
  `notchBand.ts`, `palette.ts`, `safeArea.ts`, `storageKeys.ts`, or the `plugins/` facades that
  mobile/native.md describes at length.
* **Route table** (lines 124–137) — missing `/api/report` and `/api/csp-report`, both live routes
  (`web/src/routes/api/report/`, `web/src/routes/api/csp-report/`) fully documented in the api
  skill.
* **Tech stack** — line 18–19 says Vite "Injects three compile-time constants: `__APP_VERSION__`,
  `__BUILD_TIME__`, `__NATIVE_API_BASE__`"; `web/defines.ts` lines 15–19 defines five, and the two
  omitted (`__IS_CAPACITOR__`, `__PERF_MARKS__`) are exactly the load-bearing ones other skills
  document (the tree-shaking gate in mobile/native.md lines 54–60, the marks flag in profiling).
  Line 55–56 describes Maestro as "Android smoke test" only; the iOS smoke (`npm run test:ios`) has
  existed since the ios-deploy workflow landed.

An auditor or contributor using this map concludes files don't exist, or places new code where an
unlisted sibling already lives.

#### Proposed solution

Refresh the map against the actual tree (the listing above is the checklist), add the two missing
route rows, fix the `rateLimit.ts` description, say "five compile-time constants" (or name the file
`web/defines.ts` and drop the count per the no-mutable-facts convention), and mention iOS beside
Android in the Maestro bullet. Consider a drift-guard test comparing `ls web/src/lib` module names
against the map's cited paths so the next split fails CI instead of silently rotting — the repo's
own "cross-file agreement is never maintained by prose" convention applied to its own docs.

### [Docs] architecture route table describes generate-image's retired "base64 PNG" contract, contradicting the api skill

**File(s):** `.ruler/skills/architecture/SKILL.md` (line 149) @ f5bf8767

**Priority:** P2

#### Problem

The `/api/generate-image` row says:

> Accepts a base64 PNG + style prompt, calls Gemini, returns the generated image.

The api skill (`.ruler/skills/api/SKILL.md` lines 48–58, ADR-0064) documents the current contract
precisely: **raw image bytes as the body** (WebP preferred, `Content-Type` allowlist, style as a
`?style=` query enum, credential in a header), with multipart as a labelled legacy shim. "base64
PNG + style prompt" matches neither the current nor even the legacy multipart shape, and two
generated instruction files now contradict each other on the same endpoint — the exact
"contradictory instructions" failure ruler exists to prevent.

#### Proposed solution

Rewrite the row to defer to the api skill for the contract, e.g.: "Serverless function (Netlify).
Raw drawing bytes in, stylized image out — see the `api` skill for the full contract. Token-gated +
rate-limited. Not bundled for native." Route-table rows shouldn't re-state wire details a sibling
skill owns.

### [Docs] mobile and profiling docs prescribe npm scripts that don't exist (`ios:run:choose`, `ios:run:ipad`, `npm run ios`)

**File(s):** `.ruler/skills/mobile/ios.md` (lines 65, 143),
`.ruler/skills/profiling/ipad-device-profiling.md` (line 605) @ f5bf8767

**Priority:** P3

#### Problem

Three commands cited as the way to run the app on iOS hardware are not in `package.json`:

* `ios.md:65` — "or `npm run ios:run:choose` and choose the device at the prompt". No such script;
  the chooser behavior belongs to plain `ios:run` (scripts-info line 243: "prompting to choose the
  iOS simulator or connected device").
* `ios.md:143` — "covers all Debug builds — `ios:run`, `ios:run:ipad`, `cap:ios` Run". No
  `ios:run:ipad`; the real variants are `ios:run:emulator` and `ios:run:device` (package.json lines
  116–117).
* `ipad-device-profiling.md:212` — "Build + run the native app with marks on:
  `PERF_MARKS=true npm run ios`". No `ios` script; should be `ios:run`.

Each fails with `npm error Missing script` at the exact moment a user is mid-runbook with a device
cabled up. The repo's own guidance ("run `npm run info` before guessing at a script") exists because
of this class of drift — the docs shouldn't require it.

#### Proposed solution

Replace with the real script names (`ios:run`; `ios:run:emulator` / `ios:run:device`;
`PERF_MARKS=true npm run ios:run`). A tiny repo-script test that extracts `npm run <name>` tokens
from `.ruler/**` and asserts each (or its namespace prefix) exists in `package.json` scripts would
fence the whole category — this audit found these three by exactly that grep.

### [Docs] `.claude/rules/testing.md` misstates what `npm test` runs (omits `test:scripts`)

**File(s):** `.claude/rules/testing.md` (lines 22–23); `package.json` (line 46) @ f5bf8767

**Priority:** P3

#### Problem

The path-scoped testing rule — loaded into context whenever an agent edits any test file — says:

```markdown
* `npm test` = `test:unit` + `test:asset-gen` + `test:e2e`; the native smoke tests (`test:android`,
  `test:ios`) are deliberately excluded (need an emulator/simulator + native toolchain).
```

but `package.json` line 40 is:

```json
"test": "npm run test:unit && npm run test:asset-gen && npm run test:scripts && npm run test:e2e",
```

The `test:scripts` tier (repo-automation tests in `scripts/tests/` — including the very
workflow-hygiene, labels, and claude-permissions tests that guard this section's files) is missing
from the rule. CLAUDE.md's command table has the correct four-tier description, so the two
instruction surfaces disagree, and an agent following the rule may conclude `scripts/tests/` is not
part of `npm test` and skip running it. This is also an instance of the repo's own comment
convention violation: the rule restates a mutable composition owned by `package.json` instead of
naming the owner.

#### Proposed solution

Update line 22 to include `test:scripts` — or better, stop enumerating: "`npm test` runs every CI
tier (see the `test` entry in package.json `scripts-info`); the native smokes (`test:android`,
`test:ios`) are deliberately excluded…". The pointer form can't drift when a fifth tier is added.
`.claude/rules/` is edit-in-place (not ruler-generated), so this is a direct one-file fix.

### [Docs] CONTRIBUTING.md "Release process" predates the three-phase model — it describes exactly the flow ADR-0077 was written to kill

**File(s):** `docs/CONTRIBUTING.md` (lines 227–230) @ f5bf8767

**Priority:** P3

#### Problem

The section reads, in full:

```
See the `/release` slash command in `.claude/skills/release/SKILL.md`. The short version:
`npm run release` bumps the version, tags, and pushes; the `android-deploy.yml` CI workflow fires on
the tag.
```

Two problems:

1. **It omits phases 2 and 3.** `docs/adrs/0077-three-phase-release-verified-artifact-publish.md`
   and `releases/README.md:41–52` define shipping as three ordered phases — `/release` → `/build` →
   `/publish-artifacts` (`npm run release` / `android:bundle`+`ios:ipa` / `release:publish`) —
   precisely because the "release does everything" mental model shipped a stale 1.2.0 binary on the
   v1.4.0 GitHub Release. A contributor following CONTRIBUTING's "short version" stops after phase 1
   and leaves the GitHub Release permanently binary-less (`release.mjs` now "attaches nothing,
   unconditionally" per the ADR).
2. **The `android-deploy.yml` mention misleads.** In a section titled "Release process", "the
   `android-deploy.yml` CI workflow fires on the tag" reads as the deployment step. The workflow is
   a tag-gated *Maestro smoke test* ("Runtime smoke test for the Android *deployment*… Tag-only by
   design", `.github/workflows/android-deploy.yml:1–9`) — it deploys nothing; store artifacts are
   built locally by `/build`.

#### Proposed solution

Rewrite the section to mirror `releases/README.md`'s three-phase table (or simply link it as the
authoritative source and keep one sentence: "Shipping is three ordered phases — `/release`,
`/build`, `/publish-artifacts` (ADR-0077); see `releases/README.md`."). If the smoke test stays
mentioned, name it as such: "pushing the `v*` tag also triggers the Android/iOS launch smoke
workflows."

### [Maintainability] COMPATIBILITY.md's risk register pins claims to line numbers that have broadly rotted — three now name the wrong file

**File(s):** `docs/COMPATIBILITY.md` ("API risk register" section, the `Where` column)

**Priority:** P2

#### Problem

The register cites exact `file:line` anchors. They were already drifting, and the tiled-renderer
work (#682) moved enough code that three rows no longer point at the named API at all — the *file*
is wrong, not merely the line. Those three cannot be repaired by re-counting; a reader who follows
them lands somewhere the API does not appear and cannot tell whether the row is stale or the guard
was dropped.

**Rows whose target left the cited file:**

| Doc claim                                            | Reality                                                                                                                                        |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| unprefixed `mask` — `DrawingCanvas.svelte:534`       | No `mask`/`mask-image` anywhere in `DrawingCanvas.svelte`. Surviving unprefixed uses: `PointerHalos.svelte:213`/`:218`, `AiConfetti.svelte:80` |
| `navigator.storage.persist` — `secureStorage.ts:177` | Absent from `secureStorage.ts` (212 lines total); the call is `lib/idb.ts:8`                                                                   |
| `aspect-ratio` — `app.css:294`                       | Absent from `app.css`; the uses are `ColoringBook.svelte:280`/`:331`/`:335`, `AiDial.svelte:126`/`:172`, `AiImagePrompt.svelte:143`            |

**Rows that are line-drifted only:**

| Doc claim                                                  | Actual               |
| ---------------------------------------------------------- | -------------------- |
| `getCoalescedEvents()` — `engine.ts:883`                   | `:992`               |
| `color-mix` — `ColorPicker.svelte:447`                     | `:469`               |
| `color-mix` — `ColoringBook.svelte:298`                    | `:295`               |
| `showModal()` — `modalDialog.svelte.ts:122`                | `:123`               |
| `100dvh` — `app.css:28` + `:70`                            | `:28` (holds), `:81` |
| `backdrop-filter` — `app.css:97`                           | `:108`               |
| reduced-motion off-switch — `SettingsModal.svelte:339–340` | `:237–238`           |
| `env(safe-area-inset-*)` — `app.css:54–56`                 | `:65–67`             |
| orientation lock — `orientation.ts:50–55`                  | `:41`                |
| `navigator.vibrate` — `haptics.ts:24`                      | `:34`                |
| `requestIdleCallback` — `idle.ts:8–13`                     | `:7–8`               |
| `saveData` — `updates.ts:62–64`                            | `:48–49`, `:87`      |
| `clipboard.writeText` — `AdminConsole.svelte:133`          | `:131`               |
| `willReadFrequently` — `emptyScan.ts:22`                   | `:32`                |
| `createImageBitmap` — `aiImage.ts:26`                      | `:33`                |
| `toBlob(…, 'image/webp')` — `aiImage.ts:38`                | `:45`                |
| `crypto.subtle` — `aiImage.ts:56`                          | `:77`                |
| `text-wrap: pretty` — `StepLedger.svelte:263`              | `:299`               |

Only three anchors still land exactly: `ColorPalette.svelte:46` (`ResizeObserver`),
`network.svelte.ts:17` (`navigator.onLine`), and `deviceInfo.ts:60`.

No API claim is itself wrong — every guarded feature is still guarded, so this is not a
compatibility bug. The damage is to trust in the document: it is the canonical register consulted
"before raising the floor [or] adding a modern web API", it carries no snapshot disclaimer (unlike
`docs/CODE-MAP.md`), and its "Maintaining this" section implies it is kept current.

#### Proposed solution

Two parts: (a) refresh the anchors once from the tables above; (b) stop the recurrence by switching
the `Where` column to identifier-level anchors — file + function/selector/constant name (`engine.ts`
`pointermove` handler; `ClearButton.svelte` `.clear-button--armed` gradient) — keeping line numbers
only where no stable identifier exists. Identifiers carry the register's actual value ("which file
guards this API and how") and survive refactors, which is what the three file-level breaks argue
for. A drift-guard test is overkill for prose, but a note in "Maintaining this" declaring anchors
identifier-level would set the convention.

#### Verification

For each row, `grep -n` the API token in the cited file; the row is sound only if a hit lands on the
cited line. The three file-level breaks fail immediately — each returns nothing:

```sh
grep -n "mask" web/src/lib/components/DrawingCanvas.svelte
grep -n "storage.persist" web/src/lib/secureStorage.ts
grep -n "aspect-ratio" web/src/app.css
```

### [Docs] pr-screenshots links ADR-0046 one directory too shallow — dead link in every generated location

**File(s):** `.ruler/skills/pr-screenshots/SKILL.md` (line 22) @ f5bf8767

**Priority:** P2

#### Problem

Line 22 links `[ADR-0046](../../docs/adrs/0046-pr-screenshot-hosting-via-orphan-branch.md)`. From
the generated `.claude/skills/pr-screenshots/SKILL.md` this resolves to `.claude/docs/adrs/…`, and
from `.agents/skills/pr-screenshots/` to `.agents/docs/adrs/…` — neither exists. Every other skill
in the tree that reaches the repo root uses three levels (`mobile/android.md:11` →
`../../../docs/COMPATIBILITY.md`, `burn-down-backlog:21` → `../../../.github/labels.yml`), so this
is a one-off typo, but it dead-ends the pointer to the ADR that holds "the full rationale, sources,
and rejected options" the skill explicitly declines to restate inline.

#### Proposed solution

Change to `../../../docs/adrs/0046-pr-screenshot-hosting-via-orphan-branch.md` and run
`npm run ruler:apply`. The relative-link drift-guard test proposed in the audit-conventions finding
would have caught this too.

### [Maintainability] Audit skills link `audit-conventions.md` with a path that is broken in the `.agents/` tree (and inside `.ruler/` itself)

**File(s):** `.ruler/skills/code-audit/SKILL.md` (line 63), `.ruler/skills/extract-audit/SKILL.md`
(line 53), `.ruler/skills/lighthouse-audit/SKILL.md` (line 112),
`.ruler/skills/session-audit/SKILL.md` (line 175), `.ruler/skills/dependency-health-audit/SKILL.md`
(line 229), `.ruler/skills/dependency-update-audit/SKILL.md` (lines 28 vs 125),
`.ruler/skills/workflow-audit/SKILL.md` (line 118) @ f5bf8767

**Priority:** P2

#### Problem

Skills are copied verbatim into **both** `.claude/skills/<name>/` and `.agents/skills/<name>/`
(agent-files.md lines 10–11). Six audit skills link the shared conventions as
`[`.claude/audit-conventions.md`](../../audit-conventions.md)`. That relative path only resolves
from `.claude/skills/<name>/`; from `.agents/skills/<name>/` it points at
`.agents/audit-conventions.md`, which does not exist (`.agents/` contains only `skills/` and
`skill-notes/`), and from the `.ruler/` source itself it points at a nonexistent
`.ruler/audit-conventions.md`. A Codex session following the link (the explicitly supported consumer
per ADR-0058 and knowledge-map.md lines 3–5) hits a dead path for the conventions that define the
finding format, the AUDIT-LOG entry, and the self-heal rule.

The correct form already exists in the same tree — `dependency-update-audit/SKILL.md:23` uses
`(../../../.claude/audit-conventions.md)`, which resolves to the repo-root
`.claude/audit-conventions.md` from **both** generated locations — but the same file then uses the
broken `(../../audit-conventions.md)` form at line 120, so even one skill is internally
inconsistent.

#### Proposed solution

Normalize every audit-conventions link in `.ruler/skills/**` to the
`../../../.claude/audit-conventions.md` form (or drop the hyperlink and keep the plain backticked
path, which several skills — `vet-audits`, `fix-audits`, `skills-guide` — already do successfully).
A cheap drift-guard in `scripts/tests/` that resolves every relative markdown link in the generated
`.claude/skills/**` and `.agents/skills/**` and fails on a missing target would catch this whole
class (see also the pr-screenshots and knowledge-map findings below).

## Coverage gaps on load-bearing paths

Kept where the untested surface is one whose silent breakage is expensive and not otherwise
observable.

### [Testing] Run the self-contained API-contract smoke (`test:api:smoke`) in CI

**File(s):** `.github/workflows/test.yml` (`test` job, lines 142–183); `package.json` (line 87,
scripts-info line 245) @ f5bf8767

**Priority:** P2

#### Problem

The repo has a purpose-built, dependency-free gate for the `/api/*` contract:

```json
"test:api:smoke": "node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/api-smoke.mjs",
```

whose own scripts-info description (package.json line 191) says it is "self-contained: boots a
throwaway vite dev with test env, exercises the CORS/preflight contract + the admin auth flow + a
public oracle against the documented /api/* shapes, tears down (no Gemini/Blobs needed)". Nothing in
`.github/workflows/test.yml` runs it — the `test` job runs `test:unit`, `test:asset-gen`,
`test:scripts`, `test:e2e`, and `test:driver:smoke` (lines 98–144), and no other workflow references
`api:smoke`/`api-smoke` (grep of `.github/` returns nothing). The driver smoke was added to CI at
lines 140–144 precisely because "the gen:* generators … never run elsewhere in CI, so this smoke
keeps that module from rotting silently" — the identical rationale applies to the API smoke, which
`.claude/rules/server-api.md` (lines 45–47) relies on developers remembering to run by hand after
endpoint changes. A CORS/auth/shape regression on `/api/*` currently ships with green CI and is only
caught post-deploy by `blobs-smoke.yml` (which tests one narrow thing: Blobs persistence).

#### Proposed solution

Add a step to the `test` job after the E2E run (it needs no browsers, so placement is flexible):

```yaml
# The /api/* contract (CORS, admin auth, oracle shapes) has no other CI
# coverage; self-contained — boots its own throwaway dev server.
- name: API contract smoke
  run: npm run test:api:smoke
```

Also consider folding it into `npm test` (package.json line 40) so the local composite matches; if
that is done, update the `test` scripts-info entry and CLAUDE.md's command table in `.ruler/` in the
same change. Gotcha: verify the throwaway vite dev server's port doesn't collide with the Playwright
`vite preview` server if steps ever run concurrently (they don't today — steps are sequential).
