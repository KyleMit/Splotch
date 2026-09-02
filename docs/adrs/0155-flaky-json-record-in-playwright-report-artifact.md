# ADR-0155: Every Playwright Job Writes a flaky.json Record Into Its Report Artifact

**Status:** Active **Date:** 2026-09

## Context

CI runs Playwright with `retries: 2` (ADR-0078 §4 argues the count from measured data, and this
record does not touch it). A test that fails and then passes ships a green check and appears in no
run conclusion. `web/playwright-flaky-reporter.ts` makes each retried pass visible **per run** — a
`::warning` annotation plus a `$GITHUB_STEP_SUMMARY` table — but GitHub can search neither
annotations nor step summaries over run history. Answering "what flaked this week" meant downloading
roughly thirty log archives and reading them by hand, and the most useful conclusion of that sweep —
that one spec cluster flaked repo-wide while another only ever flaked on branches rewriting the code
it exercised — needed branch attribution the logs barely carried.

The digest that aggregates across runs is future work. What it needs now is a structured record per
job that it can sum. Alternatives considered for producing one:

* **Scrape the logs from the digest.** Rejected: it is the manual sweep automated, still bound to
  the log format of three reporters, and still blind to the branch a run came from.
* **A separate artifact with its own upload step.** Rejected: a new artifact name and a new filename
  shared between TypeScript and YAML, which the cross-file rule says obliges a drift-guard test.
  Placing the record inside the folder the jobs already upload removes that obligation instead of
  satisfying it — provided the HTML reporter cannot clobber it (see below).
* **Emit Playwright's built-in `json` reporter (or the `blob` event stream) into the artifact and
  derive flakes in the digest.** The strongest alternative: in Playwright 1.62.1 the JSON reporter
  already serializes the project name, the rootDir-relative file and line, every result's `status`
  and `retry`, and aggregate flaky counts, and blob preserves the whole reporter event stream with
  shard merging — so there would be no bespoke schema and no `schemaVersion` promise. Rejected on
  three counts: the output is the entire suite, several megabytes per shard against a few hundred
  bytes for a record that names only what flaked; neither carries the GitHub run identity — above
  all the head branch — that the motivating sweep needed; and a JSON `outputFile` placed inside the
  HTML folder depends on reporter `onEnd` order exactly as a naive custom write would, with no
  `onExit` to move it to. The trade is a small versioned contract of this repo's own against a large
  one of Playwright's; a digest that later wants per-test detail can add the JSON reporter beside
  this record rather than replace it.
* **Write only when something flaked.** Rejected: a digest that only ever sees flaky runs cannot
  compute a rate, and cannot tell a clean shard from one whose reporter never ran.
* **Lower `retries` so flakes go red.** Out of scope, and ADR-0078 §4 already rejected it on the
  evidence.

Two facts were established empirically before placement was decided, because either could have
invalidated it. Playwright's HTML reporter empties its output folder inside its own `onEnd`, and the
reporter multiplexer runs every reporter's `onEnd` sequentially before it runs any `onExit`. A file
written from `onBegin` did not survive the run; one written after the HTML reporter's `onEnd` did.

## Decision

**One folder, pinned once.** `playwrightReportFolder` in `web/playwright.shared.ts` names the report
folder and `web/playwright.config.ts` hands it to both the HTML reporter (`outputFolder`) and the
flaky reporter. The HTML reporter's default happens to be the same place — the nearest
`package.json` directory, which ADR-0024 puts at the repo root rather than `web/` — but two
resolutions agreeing by coincidence is the "keep in sync" defect the conventions forbid. The
workflow's upload steps still name that folder by literal path, because YAML cannot import the
constant, so `tools/tests/playwright-report-folder.test.mjs` fails if either side moves and also
checks the folder stays gitignored.

**Written from `onExit`, not `onEnd`.** The record is `playwright-report/flaky.json`, written in the
flaky reporter's `onExit`. Playwright documents `onExit` as running once every reporter has received
`onEnd`, so the record lands after the HTML reporter has emptied the folder, whatever order the
config lists the reporters in. Writing from `onEnd` would have worked today only because the flaky
reporter is listed last — an ordering invariant nothing enforced.

**Written on every run, clean or not.** `onEnd` keeps its early return, so annotations and the
summary stay silent on a clean run; the record is the one output that is never silent. Local runs
write it too (`retries: 0` there makes it an empty record) — one code path, and the folder is
gitignored so nothing churns.

**Schema.** A record is:

```json
{
  "schemaVersion": 1,
  "run": { "id": "…", "attempt": 1, "sha": "…", "branch": "…", "event": "pull_request" },
  "shard": { "current": 3, "total": 8 },
  "status": "passed",
  "tests": 47,
  "flaky": [
    {
      "title": "chromium › admin.spec.ts › signs in",
      "attempts": 2,
      "project": "chromium",
      "file": "admin.spec.ts"
    }
  ]
}
```

* `run` is `null` outside GitHub Actions. `branch` is `GITHUB_HEAD_REF` when set, else
  `GITHUB_REF_NAME`: on a `pull_request` event the ref name is the synthetic `<n>/merge`, and a
  record keyed on it could never make the repo-wide-versus-one-branch distinction that motivated
  this work.
* `shard` comes from Playwright's own `config.shard`, not a matrix env var — one less YAML coupling.
* `project` and `file` are carried structurally (`test.parent.project()`, `test.location.file`
  relative to `config.rootDir`, Playwright's documented base for reporter paths) rather than parsed
  back out of the `›`-joined title; the tests pin that they agree with the title's segments.
* `status` is Playwright's verdict on the whole run (`passed`, `failed`, `timedout`, `interrupted`).
  A run cut short by SIGINT or `globalTimeout` still reaches `onExit`, and the workflow's
  `if: !cancelled()` still uploads its folder, so without this an interrupted shard would read as a
  small clean sample. A digest keeps `passed` and `failed` and drops the rest; the record is marked
  rather than omitted because an absent record is indistinguishable from a reporter that never ran.
* `tests` counts each test once, on its first attempt, excluding skipped and interrupted ones — the
  denominator for a per-execution flake rate, which a 200-test shard and a four-test engine smoke
  need separately.
* `schemaVersion` is present from the first version. With one version and no reader yet it is
  arguably speculative surface, but the artifacts are retained across commits and a digest reading a
  week of them must be able to tell a record it understands from one it would misread — the same
  reason the perf and Lighthouse tooling version theirs. Adding a field is compatible; the number
  moves when a field changes meaning or goes away.

**Scope.** The eight chromium shards and the Firefox and WebKit smoke jobs all run this config and
upload this folder, so all of them emit. That is deliberate: the smoke jobs are the only place a
non-Blink flake can ever become visible.

**The test seam is the production option.** The reporter's only constructor option is
`outputFolder`, and the config is its production caller; the tests pass a fresh temp directory.
There is no default folder, and the constructor throws without one, because a fixture that defaulted
to the real `playwright-report/` would run under `npm run test:tools` inside the CI Tests job and
its fabricated record would be uploaded and summed as genuine flake data — the same hazard the
existing tests already defuse for `GITHUB_STEP_SUMMARY`, in a worse form. The same tests also pin
the `GITHUB_*` identity variables for the duration, so a record's `run` is the fixture's whether or
not the test itself runs on Actions.

## Consequences

\+ Masked flakes become a structured artifact per job, retained with the HTML report for the same
seven days, with the branch, shard, commit, and denominator a digest needs.

\+ No new artifact, upload step, or YAML filename; the one cross-file coupling that remains (the
folder) is drift-guarded.

\+ Changing reporter order can no longer silently delete the record.

− The record lives seven days, the report artifact's retention. A digest must run within that window
or the history is gone; extending retention is a workflow change, not a reporter one.

− The HTML reporter's folder is now set explicitly rather than defaulted, so
`PLAYWRIGHT_HTML_OUTPUT_DIR` still moves the HTML report but not the record. Nothing in the repo
sets it; honoring it in the flaky reporter too was judged speculative.

− `schemaVersion` is a promise: a reader must exist before the number is ever bumped, and bumping it
without one is noise.
