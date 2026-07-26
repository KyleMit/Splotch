# Handoff — Codex audit burndown

> 2026-07-26 · branch `codex/audit-burndown-20260726` · Adapt the bulk audit driver to Codex and
> resume the 399-finding backlog.

This is the durable checkpoint required by the `burn-down-audits` skill. A fresh session resumes
from this file plus `npm run audit:status`.

## Objective & non-goals

* **Objective:** generate runner-specific burn-down skills, use Codex for every model-backed role,
  map Sonnet-tier work to `gpt-5.6-terra` and Opus-tier work to `gpt-5.6-sol`, then continue
  draining `docs/AUDIT.md` one approved finding per commit.
* **Non-goals:** no in-session subagents; no hand-fixing findings outside the driver; no direct
  edits to `docs/AUDIT.md`; no GitHub calls from the driver.

## Relaunch command

Carry every override on every run:

```bash
AGENT_RUNNER='codex' \
BRANCH='codex/audit-burndown-20260726' \
CHECK_CMD='npm run check && npm run lint:tokens && npm run gen:tokens:check && npm run scrapbook:check' \
TEST_CMD='npm run test:unit && npm run test:scripts' \
npm run audit:burndown:overnight -- 600
```

For the required foreground canary, use the same environment with:

```bash
MAX_ISSUES=5 npm run audit:burndown
```

The runner and branch are not optional. The defaults remain Claude and `audit/burndown` for backward
compatibility.

## State

* Branch forked from current `main` at 899fd035191b, the merge of PR #547.
* Backlog before this continuation: **399 findings**.
* The prior Claude run fixed 40 findings, dropped 6, and deferred 4; its PR #547 is merged.
* The runner adaptation is implemented locally and awaiting its checkpoint commit and draft PR.
* Ruler 0.3.44 cannot select different skill source trees per agent. The deterministic
  `scripts/apply-ruler-agent-overrides.mjs` post-step overlays `.template` sources after
  `ruler apply`; Claude retains the shared skill while Codex receives the generated `.agents`
  variant.
* `scripts/audit-burndown/agent-runner.mjs` owns CLI argument construction, authentication,
  role-model defaults, structured-envelope parsing, retry handling, and Codex thread resumption.
* Actual nested `codex exec` calls must be launched outside the outer filesystem sandbox. A direct
  Codex JSONL, schema, and resume probe passed; the same call failed only when deliberately run
  inside the outer sandbox with `Operation not permitted`.

## Decisions made

* Keep the Node driver as the sole orchestrator. Each role remains an isolated one-shot process, and
  a fix round resumes only the original implementer thread.
* Preserve Claude as the compatibility default; select Codex explicitly with `AGENT_RUNNER=codex`.
* Use `gpt-5.6-sol` for P1–P3 implementation and adversarial review, and `gpt-5.6-terra` for
  verification and P4–P5 implementation.
* Keep the Codex reviewer read-only; verifier and implementer use workspace-write. Disable
  multi-agent features for every nested Codex call.
* Leave `PUSH_TEST_CMD` empty while supervising the draft PR. Per-finding gates plus final-HEAD CI
  are the backstop.
* Amend ADR-0058 instead of adding a new ADR because it already owns Ruler-generated agent files.

## Unverified assumptions

* The complete five-finding driver canary works through the new adapter; direct CLI probes and unit
  tests cover its components but not the whole loop.
* The canary's final GitHub Actions run is green.
* No canary finding requires a fix round. If one does, confirm the implementation and fix JSONL
  envelopes carry the same Codex thread id.

## Done & verified

* `npm run test:scripts` — 78 tests passed.
* `npm run check` — zero errors and warnings.
* `npm run lint` — passed.
* `npm run format:check` — passed.
* `git diff --check` — passed.
* Ruler generated distinct Claude and Codex skill files; both frontmatters parse and validate.
* `codex login status` — logged in using ChatGPT.
* Direct `codex exec` probes verified JSONL output, JSON Schema output, and thread resumption.

`npm run ruler:check` must be rerun after the generated files are staged. Its current dirty-tree
failure is expected because that gate intentionally reports unstaged generated output.

## Closeout tasks

1. Stop cleanly with `.audit-work/STOP`; wait for the driver and nested Codex call to exit.
2. Confirm `HEAD` equals `origin/codex/audit-burndown-20260726`.
3. Capture and drain every pending PR comment through the GitHub connector, with an OpenAI Codex
   attribution footer, then run capture once more.
4. Reconcile fixed/deferred/dropped counts from each run's `finished:` line.
5. Tidy empty source sections in `docs/AUDIT.md`; delete it only if empty.
6. Add the run row to `docs/AUDIT-LOG.md`.
7. Require final CI green, mark the PR ready, and delete this consumed handoff.

## Risks & next 3 steps

1. Commit and push the runner adaptation plus this checkpoint; open the draft PR and record it here.
2. Run exact-override preflight, then the five-finding foreground Codex canary.
3. Inspect all canary diffs and audit-entry removals, require final-HEAD CI green, report cost, then
   launch the full continuation command.

## Reread first

* `.agents/skills/burn-down-audits/SKILL.md`
* `scripts/audit-burndown/agent-runner.mjs`
* `scripts/audit-burndown/burndown.mjs`
* `docs/adrs/0058-ruler-generated-agent-files.md`
* `.audit-work/compact-snapshot.md` if it exists and its timestamp belongs to this run
