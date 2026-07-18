---
name: dependency-health-audit
description: Inventory and evaluate every third-party dependency — who publishes it, its license, stars, release cadence, maintenance health, abandonment risk, and whether to keep or replace it — written to docs/DEPENDENCIES.md. Use when asked to inventory or catalog dependencies, assess dependency health or provenance, review maintenance/abandonment risk, find dependencies worth replacing, or produce an SBOM-style dependency review. It analyzes dependencies but never upgrades them — to apply version updates use dependency-update-audit instead.
argument-hint: "[package-name] (optional — refresh only that package's entry)"
---

# Dependency Health Audit

Build and refresh a health assessment of every third-party package Splotch depends on: what it is,
why we use it, who maintains it, how alive it is, and whether it should stay. The output is
`docs/DEPENDENCIES.md` — an SBOM-like inventory that goes beyond a standards SBOM by judging
maintenance health and recommending keep/replace per package.

**This skill is read-only analysis.** It never edits `package.json`, the lockfile, or source — no
version bumps, no installs beyond what's already on disk. Its sibling `dependency-update-audit` is
the Dependabot-like workflow that *applies* upgrades; this one decides whether a dependency
*deserves its place at all*. If an entry here concludes a package should merely be updated, that's a
hand-off to `/dependency-update-audit`, not work for this run.

There is **one root `package.json`** for the whole repo (web + Capacitor native); run all npm
tooling from the repo root. **Direct** dependencies are the entries in its `dependencies` /
`devDependencies`; everything else in `package-lock.json` is **transitive**. Direct deps get the
full per-package treatment below; transitives get the lighter aggregate pass — a human review of ~50
direct packages is tractable and high-value, one of ~1100 transitives is neither.

If an argument names a package, refresh only that entry — but a scoped run still feeds report-level
sections: update the package's row in the verdict summary table if its verdict changed, and mark the
header as a **scoped** refresh (e.g. `**Last refresh:** … · scoped: package-name`) rather than
bumping the full-run date line, so the report doesn't falsely read as freshly re-verified end to
end. Skip every other entry.

## Phase 1 — Inventory (local facts, no network)

1. **Enumerate.** Read `package.json` for the direct prod/dev split and declared ranges. Take the
   **locked** version of each package from `package-lock.json` — it's always present and needs no
   install, whereas `npm ls --depth=0` errors with `ELSPROBLEMS` on a fresh checkout where
   `node_modules` isn't installed (and this skill installs nothing). Use `npm ls --depth=0` only as
   optional confirmation *when* `node_modules` exists. Count the lockfile's `packages` entries for
   the total installed footprint (`node -e` over `package-lock.json`).
2. **Attribute usage.** For each direct dep, establish *why and where* Splotch uses it: grep
   `web/src/`, `web/*.config.*`, `scripts/`, `tools/`, and the npm scripts for imports and
   invocations. A package with no findable usage is itself a finding (candidate for removal — but
   check `overrides`, `postinstall`, config-file plugin references, and CLI-only use before calling
   it dead).
3. **Note repo entanglements.** Known ones to carry into entries (verify, don't assume):
   * `package.json` `overrides` pins `@capacitor/assets`' transitive `sharp` to the root `$sharp`
     (proxy-blocked libvips download in cloud sessions) — an entanglement for both packages.
   * The Svelte/Vite family and `@capacitor/*` move as coordinated sets (see
     `dependency-update-audit`'s landmine list) — replacement cost for any member includes the set.

## Phase 2 — External facts (network, dated)

For each direct dep, gather registry and upstream facts. `npm view <pkg> --json` yields most of it
in one call: latest version, publish `time` history, `license`, `repository.url`, `maintainers`,
`deprecated`. For upstream health, hit the GitHub API via `WebFetch`
(`https://api.github.com/repos/<owner>/<repo>` → `stargazers_count`, `pushed_at`, `archived`,
`open_issues_count`; `/releases?per_page=5` and `/commits?per_page=5` for cadence). Outbound HTTPS
goes through the session's agent proxy — if a fetch 403s, note the gap in the entry rather than
inventing a number.

**Every externally gathered fact must carry the date it was checked and a link to its source.**
Stars, release dates, and activity all drift — an undated snapshot is misinformation six months from
now. The entry format below bakes this in: external facts live on `(checked YYYY-MM-DD)` lines whose
values link to the page that proves them (repo page, releases page, npm package page). Minimum
linking so runs grade consistently: link the star count to the repo and the latest-release fact to
the `/releases` page; same-repo facts on the same line (last commit, open issues) are covered by
those two links and needn't each carry their own. A `Health` line with only the star count linked
and bare release/commit dates is under-sourced — add the releases link.

**The GitHub upstream pass is mandatory, per package — not optional colour.** The whole point of
this skill over a plain SBOM is the maintenance judgement, and that judgement is only as good as the
per-repo facts behind it. The tell of a skipped Phase 2 is a `Maintenance` line that reads
*identically* across many entries (e.g. the same "upstream activity not sampled this run" disclaimer
everywhere) — that is a failed run, not a style choice. Each `Maintenance` verdict must cite
package-specific evidence: a real last-commit date and an observed release cadence. If a repo
genuinely can't be reached (403/archived), disclose the reason **on that package's line**, never as
a blanket excuse across the report.

Batch the network work: these lookups are independent, so run them concurrently (parallel tool calls
or subagents per chunk of packages) instead of one at a time.

## Phase 3 — Assess and recommend

Judge each direct dep and assign one verdict:

| Verdict                     | Meaning                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **keep**                    | Healthy and earning its place; no action.                                                                                            |
| **monitor**                 | A live risk signal (slowing releases, single maintainer, pending rewrite, soft deprecation) but no action yet — say *what to watch*. |
| **investigate replacement** | A real concern; name the candidate alternatives and the question an investigation must answer.                                       |
| **replace**                 | The case is already clear; name the successor and why.                                                                               |

Abandonment signals to weigh (none is conclusive alone): archived or read-only repo; `deprecated` on
npm; no commits or releases in 12+ months *while* issues/PRs pile up unanswered; maintainer farewell
posts; incompatibility with the current toolchain papered over locally; unpatched security
advisories. Distinguish **done** from **dead**: a small, stable, zero-dep utility with no activity
and no open issues is often finished, not abandoned — low activity plus low churn plus no bug
backlog can be a *good* sign.

**A stale release is not "active."** A multi-year gap since the last publish is an abandonment
signal for anything that isn't a finished zero-dep utility — do not write `Maintenance: active` off
npm *publish* metadata alone (that a version exists on npm says nothing about whether the repo still
moves). Cross-check the repo's last commit before calling a package active; a live repo with an old
release is "slowing," an archived repo with an old release is at least `investigate replacement`.

**Version drift is a currency signal, not an action for this skill.** When the locked version trails
the latest by a major (or sits several minors behind for months), note it in `Concerns` — it feeds
the verdict and is explicitly handed to `/dependency-update-audit`. Do not silently write
`Concerns: none` on a package that is a full major behind, and do not apply the bump here.

For security/ecosystem concerns, check `npm audit --json` (map advisories to the package),
`deprecated` flags, install scripts, and anything notable about the publisher (org-backed vs.
individual, provenance/attestations if published with them).

**Verdicts that require action leave the report and enter the backlog.** For each `replace` (and any
`investigate replacement` worth scheduling), offer to open a GitHub issue — `type:chore` +
`area:infra`, format per `docs/ISSUE-WORKFLOW.md` — since the live backlog is GitHub Issues, not a
Markdown list. Gate the issue-filing on `AskUserQuestion` in an interactive session; in an
autonomous run, list the proposed issues in the report/summary instead of filing unasked.

## Phase 4 — Transitive pass (aggregate, lighter)

Do **not** write per-package entries for transitives. Instead report, in one section:

* Total installed package count (from the lockfile) vs. direct count.
* `npm audit` summary: advisory counts by severity, and for each advisory the transitive → direct
  parent chain (`npm ls <pkg>`) so the fix owner is obvious. **The table must reconcile with the
  summary:** the per-row severities have to sum back to the stated by-severity counts. When you
  collapse a group into one row (e.g. five `@opentelemetry/*` advisories sharing a parent), put the
  count in that row (`… (moderate ×5)`) so the totals still add up and no advisory silently drops
  out of the chain-mapping.
* Deprecated packages surfaced by install warnings or spot `npm view` checks.
* Packages with install scripts (scan `package-lock.json` for `hasInstallScript`) — the
  supply-chain-relevant subset worth naming.
* Any transitive already entangled with the repo (today: the `sharp` override above).

Promote a transitive to a full direct-style entry only when it's individually load-bearing or
individually risky (patched, overridden, vulnerable with no upstream fix, or deprecated with no
parent fix released).

## Phase 4b — Development-lifecycle dependencies (outside `package.json`)

`package.json` isn't the whole dependency surface. The dev/CI lifecycle also relies on things no npm
range governs, and they carry the same provenance/health/pinning questions. Inventory them in their
own report section (`## Development lifecycle dependencies (outside package.json)`). Their versions
come from **workflow/script pins, not `package-lock.json`** — refresh them by re-reading the files,
not `npm view`. Three kinds:

* **GitHub Actions** — every `uses:` in `.github/workflows/*.yml`
  (`grep -rhoE "uses: [^ ]+@[^ ]+"`). Note the pin (tag/SHA), publisher (first-party `actions/*` vs.
  third-party), and for third-party actions the repo health (stars/last-push/archived/latest tag via
  the GitHub API) + whether the pinned major is behind latest. Flag **inconsistent pins** of the
  same action across workflows, and that GitHub's hardening guidance prefers SHA pins for
  third-party actions.
* **Runtime-fetched CLIs** — tools invoked by npm scripts that aren't deps: `npx <tool>` (often
  unpinned → runs latest each time), and globally-installed CLIs deliberately kept out of the tree
  (e.g. `netlify-cli`, guarded by a `scripts/check-*.mjs`). Grep `package.json` scripts and
  `scripts/*.mjs` for `npx`, and bare tool names (`netlify`, `cap`, `maestro`, `adb`, `emulator`,
  `xcodebuild`, `gradle`). Confirm a tool is genuinely absent from the lockfile before listing it
  here (`node -e` over `package-lock.json`).
* **System toolchains** — the language/SDK layer native builds and tests need: Node (`setup-node`
  `node-version`), JDK (`setup-java` `distribution`/`java-version`), the Gradle wrapper, the Android
  SDK/emulator/adb (`android-emulator-runner` `api-level`), and Xcode/`xcodebuild` (usually the
  runner's default — an **unpinned** float worth flagging). Record where each is pinned, or that it
  floats.

Assign the same verdicts (keep/monitor/investigate/replace). Typical monitor triggers here: unpinned
`npx`/`curl | bash` installs (Maestro, kill-port), a third-party action a major behind, an unpinned
Xcode. A version-bump-only finding (e.g. an action `@v5` → `@v6`) is a hand-off to
`/dependency-update-audit`, same as an npm minor.

## Phase 5 — Write the report

Write `docs/DEPENDENCIES.md`, **refreshed in place** — one stable file, so `git log -p` gives a
meaningful health-over-time diff. Dated report copies or wholesale rewrites destroy that; to keep
diffs honest:

* Keep entries **alphabetical** within each section; one fact per line; don't reformat lines you
  didn't re-check.
* On refresh, update the facts that changed and the `(checked …)` dates of what you re-verified;
  leave still-true lines untouched.
* Remove an entry only when the dependency itself is gone from `package.json`.

File header (create the file if missing — its absence just means the first audit hasn't run):

```markdown
# Dependency Health

> Inventory and health assessment of Splotch's third-party dependencies, written by the
> `dependency-health-audit` skill (see `.claude/audit-conventions.md`). Refreshed in place — compare
> runs with `git log -p docs/DEPENDENCIES.md`. External facts are snapshots; each carries the date
> it was checked. This file records analysis only — upgrades are applied by
> `/dependency-update-audit`, and replacements are tracked as GitHub issues.

**Last refresh:** YYYY-MM-DD at `<short-sha>` · NN prod + NN dev direct · NNNN total installed
```

Then: a **verdict summary table** (`| Package | Prod/Dev | Verdict |`, non-`keep` rows first), a
`## Direct dependencies — production` section, `## Direct dependencies — development`,
`## Transitive dependencies` (Phase 4 content), and
`## Development lifecycle dependencies (outside package.json)` (Phase 4b content — a table per kind:
GitHub Actions, runtime-fetched CLIs, system toolchains). Per-package entry format:

```markdown
### package-name

* **Version:** `^1.2.3` declared · 1.2.5 locked (per `package-lock.json`) · prod
* **Used for:** what it does for Splotch, and where (`web/src/…`, config, npm scripts)
* **Source:** npm · [github.com/owner/repo](https://github.com/owner/repo) · published by Org/person
* **License:** MIT
* **Health** (checked 2026-07-17): [4.2k stars](https://github.com/owner/repo) ·
  [latest 1.2.5 on 2026-06-01](https://github.com/owner/repo/releases) · last commit 2026-07-10 ·
  steady release cadence
* **Maintenance:** active — evidence in one clause
* **Concerns:** advisories, install scripts, ecosystem risk — or "none"
* **Alternatives:** viable candidates with a word on fit — or "none needed"
* **Verdict:** keep — one-line justification
```

Omit a line only when the fact is genuinely unavailable (say why: "repo 403s through proxy, checked
2026-07-17"). `Maintenance` takes active / slowing / dormant / done-not-dead / abandoned, and must
carry package-specific evidence (see Phase 2) — the same `Maintenance` sentence repeated verbatim
across entries means the upstream pass was skipped. Optionally record the deprecation check inline
per package (`not deprecated (npm, checked …)`) so each entry shows the check actually ran.

## Shared audit conventions

This is an audit skill. It writes to its own report (`docs/DEPENDENCIES.md`), not `docs/AUDIT.md`,
but the run-tracking conventions in [`.claude/audit-conventions.md`](../../audit-conventions.md)
still apply:

* **Log the run** (§2) — add a row to `docs/AUDIT-LOG.md`: how many packages reviewed, the verdict
  split, and any replace/investigate calls.
* **Self-heal** (§3) — fold durable *method* knowledge back into this file: a newly discovered repo
  entanglement for Phase 1's list, a data source that lied, a proxy workaround, a false-abandonment
  trap. Specific package verdicts stay in the report, not here.
