# ADR-0126: Auto-Recover From Network-Starved Playwright Setup

**Status:** Active (amended) **Date:** 2026-08

## Context

The Playwright setup steps in CI are bounded (`.github/actions/setup-playwright` wraps its network
commands in coreutils `timeout`; `.github/actions/setup-playwright-webkit` uses a perl `alarm` on
macOS) because a degraded runner starves them of bandwidth and, unbounded, that read as a hung test.
The bound made the diagnosis cheap — the annotation names the step and says a different machine is
the remedy — but recovery stayed manual: someone had to notice the red check and click re-run, and
the failure kept recurring (issue 1125 records an instance where apt fetched ~100 packages quickly,
then stalled past the 180s bound while every other job in the matrix was green).

Three non-exclusive options existed:

1. **Cache the apt packages** so the common path stops touching the network at all. The obstacle is
   that `playwright install-deps` opens with an unconditional `apt-get update`, so pre-seeding
   `/var/cache/apt/archives` cannot make that command offline — the cached files have to be handed
   to apt directly, bypassing `install-deps` on the hot path.
2. **Automate the documented remedy**: a `workflow_run`-triggered workflow that calls the
   re-run-failed-jobs API once. In-job retry is ruled out — the recovery unit is the runner, and
   nothing inside a job can change runners — but a job-level re-run gets a different machine.
3. **Retune the bound.** Rejected on its own: a larger bound trades minutes for fewer manual re-runs
   and still strands genuinely dead runners.

## Decision

Do both 1 and 2; leave the bounds as they are.

**Apt package cache** (`.github/actions/setup-playwright/action.yml`): after a successful bounded
`install-deps`, the downloaded `.deb` files are copied out of `/var/cache/apt/archives` (apt-get,
unlike the `apt` porcelain, leaves them there) into a directory persisted by `actions/cache`. The
key is runner image identity (`ImageOS`-`ImageVersion`) + browser set + Playwright version, because
the deb set is only complete against the package lists baked into that exact image build. On a hit,
the debs are handed straight to `apt-get install --no-download` — no `apt-get update`, no fetch —
and the network-free `npx playwright install-deps --dry-run` (an `apt-get install -s` simulation
that exits non-zero on any missing package) verifies the result. Any failure on that path routes to
the bounded network step, so a stale cache costs seconds, never a run, and the cache action's post
step only saves when the key missed and the job succeeded, so a timed-out install cannot poison the
cache. The former combined `install --with-deps` branch is split into an `install-deps` step and a
browser-only `install` step so the deb set gets captured even on a browser-cache miss and each
network step carries its own labelled bound.

**One-shot auto-rerun** (`.github/workflows/rerun-setup-timeouts.yml`): on every completed, failed
`Tests` run it reads each failed job's annotations through the check-runs API (an Actions job is a
check run) and calls the re-run-failed-jobs API exactly when two guards pass: `run_attempt == 1`
(one shot — a second starved machine surfaces as an ordinary red check, no re-run loop), and the
setup-timeout marker appears on **every** failed job (a run that also carries a real test failure is
left for a human, so no genuine failure earns a free retry). The marker pattern and the annotation
titles emitted by `report-setup-timeout.sh` and the macOS action live in files that cannot share
code; `tools/tests/rerun-setup-timeouts.test.mjs` is the drift guard, and it also executes the
workflow's decision script against a stubbed `gh` to lock the branching.

## Consequences

\+ The common CI path (browser cache hit + deb cache hit) performs Playwright setup with no network
traffic at all, removing the exposure the bounds were managing rather than managing it better.

\+ A starved runner during any Playwright setup — Ubuntu deps, Ubuntu browser download, macOS WebKit
download — recovers without a human: the annotation still fires, and the failed jobs re-run once on
fresh machines.

\+ A second consecutive starvation still surfaces as a red check with the existing annotation, so
persistent infrastructure trouble is not silently retried away.

− The deb cache key rotates with every runner image update, so the first run on a new image pays the
bounded network path (and repopulates the cache); the exposure window is narrowed, not closed.

− A stale-but-hit deb cache adds a few seconds of failed offline install before the network fallback
— the price of making the cache purely an optimization.

− `rerun-setup-timeouts.yml` grants `actions: write` to an automated workflow and re-runs real test
failures alongside a setup timeout only when they never co-occur in a run — the every-failed-job
guard means a mixed run gets no automation, which is deliberate but leaves those runs manual.

− Annotations are read back moments after the run completes; if the check-runs API has not yet
materialized them, the guard sees no marker and skips the re-run — the failure mode is falling back
to today's manual behavior, never a spurious re-run.

## Amendment (2026-08, PR 1127)

Two of the decision's mechanisms are revised, one is retired, and one is added.

**The offline install is `dpkg -i`, not `apt-get --no-download`.** The `apt-get install
--no-download <debs>` path never installed anything: apt classifies even a command-line local `.deb`
as a fetch and refuses it (`E: Unable to fetch some archives`), so the step only passed when every
package was already present and every run silently fell through to the network install — the
exposure the cache was built to remove. Reproduced deterministically on Ubuntu 24.04. `sudo dpkg -i`
installs the cached set in one offline transaction and exits non-zero when the set is incomplete;
the `--dry-run` completeness gate and the network fallback are unchanged.

**The bounds and the auto-rerun are retired.** With the cache-hit path genuinely offline (verified
in CI: both network steps skip with `duration_ms=0`), the network install runs only when a cache key
rotates, and the bound/annotation/re-run machinery (`report-setup-timeout.sh`,
`rerun-setup-timeouts.yml`, its drift test, and the macOS `perl alarm`) guarded a path that had
shrunk from every-run to rotation-day. The calling job's `timeout-minutes` is the remaining
backstop; a starved runner on a cache-miss run surfaces as an ordinary red check to re-run by hand.

**`warm-playwright-cache.yml` closes the rotation window for pull requests.** Cache entries saved by
a PR run are scoped to that PR's merge ref — sibling PRs cannot restore them — so after a key
rotation each open PR would pay the network install itself until a default-branch run saved the new
entry. The workflow runs `setup-playwright` for each browser set on a daily schedule (runner-image
rotations) and on dependency-changing pushes to main (Playwright bumps), so the shared
default-branch caches exist before PR runs ask for them.
