# Audit comments — Other & run notes

3 of the 464 archived burndown PR comments. Part of the [audit comment archive](README.md) — see the
README for what this archive is, the full run table, and the category index.

## PR [\#543](https://github.com/KyleMit/Splotch/pull/543) — Audit burndown: 9 fixes, and a fix for the driver destroying findings (2026-07-25)

### Canary halted the run: three findings in five were being destroyed

The first 5-finding canary reported `finished: 5 fixed, 0 dropped, 0 deferred` with every gate green
— and had silently deleted **three unrelated findings** from the backlog. Fixed in f389dd39 before
scaling to 600; the run has not launched at full size.

#### What happened

The driver folds the `docs/AUDIT.md` excision into the fix commit by **amending, after the review
approves**. So every landed burndown commit contains its own entry deletion — but the commit the
reviewer reads does not yet.

The reviewer noticed exactly that and rejected three of the five fixes for "not deleting the entry",
citing the neighbouring commits that (post-amend) do. It's a sharp observation from a blind reviewer
and nothing in its prompt could have told it it was wrong. The implementer complied and ran
`pop.mjs --delete`. Then the driver's own `deleteFirstEntry()` fired — and the first entry was now
the **next** finding. It got deleted, unverified and unreviewed, inside a commit about something
else.

| Commit       | Fixed                        | Also destroyed                                                         |
| ------------ | ---------------------------- | ---------------------------------------------------------------------- |
| e1952146b1c8 | NotchBand status-bar effects | `[P4][readability] ActionsPanel duplicates the drawer transition list` |
| 86b98e560438 | InstallBanner magic numbers  | `[P5][discoverability] SplotchyIcon bypasses the Icon system`          |
| cf55a8f2b72d | ErrorScreen off-scale sizes  | `[P5][readability] Slider's snap-band width`                           |

Nothing flagged it. No deferral, no red gate, no log line, and the run's own counts were true as far
as they went. The tell was only in the arithmetic — the remaining count fell by 8 across 5 findings.
The canary checklist reads commits with `':(exclude)docs/AUDIT.md'`, which is what makes the code
reviewable and is also precisely what hid this.

#### The fix

Deletion is now keyed on **identity, not position** — `deleteEntryByTitle(title)` at all three call
sites (fix, drop, defer). A duplicated delete becomes a no-op instead of a data loss, and the
success path logs `entry already gone — a role edited the audit file` as a tripwire. Positional
deletion was only ever correct while the entry being worked on was still first, and a role could
invalidate that mid-finding.

Both prompts were corrected too — the reviewer is told the excision is the driver's job and must
never be raised; the implementer is told never to edit the backlog or run `pop.mjs`, and to push
back if a round asks it to. Those are the backstop, not the fix: a prompt asking a model not to do
something is not a guarantee, the lib change is.

All three destroyed findings were recovered from the pre-run backlog and re-filed at the head of
their original section (backlog 498 → 501), so they will be processed first. Four new unit tests in
`scripts/tests/audit-burndown-lib.test.mjs` lock the identity keying, and the canary checklist
gained a step that counts entries deleted per commit (6bbe678a).

Worth keeping in view: the two commits that were *not* rejected deleted exactly one entry each. The
same review step that caused this also caught a compile-time guard inversion that would have shipped
a Capacitor plugin into the web bundle, and a "fix" that silently shrank the crash screen's heading
from 32px to 28px. The reviewer is working; it was reasoning from a commit that doesn't show the
whole truth.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/543#issuecomment-5079055515) · 2026-07-25
15:27:55 UTC</sub>

### Post-run self-heal (25e22124)

Three more frictions from this run, folded back into the skill and driver per the "the skill doc
self-heals from runs" convention. None broke a finding; all cost time.

**`capture` re-armed already-posted comments.** It deduped against the comment store alone — and the
store is empty exactly when the drain succeeded. So running it after draining as a completeness
check ("did I miss any?") silently re-added all 9 posted records, indistinguishable from real work
owed; the next step would have been posting 9 duplicates onto this PR. `done` now records each
posted sha and `capture` skips them, reporting `skipped N already posted`. Verified against the
exact case: the post-drain capture that previously re-armed 9 now reports
`skipped 9 already
posted, 0 captured`.

**The documented launch order was impossible.** The skill said "preflight, then open the draft PR
(head = `BRANCH`)" — but a freshly-forked branch is byte-identical to `main`, and GitHub refuses a
PR with no commits between them. Every run hits this and improvises. Reordered rather than patched:
commit the durable checkpoint first (the skill already required writing one), which gives the PR
something to open against. Also names the `BRANCH` override — it defaults to `audit/burndown` while
a cloud session is usually assigned a `claude/<topic>` branch, and the driver takes the default
silently.

**The timing table was re-baselined.** It carried a "measured before the `EFFORT_*` knobs" warning
asking for exactly this. From this run's ten findings, with the sample size stated since ten P2–P5
findings are shape rather than distribution:

| Finding shape                 | Elapsed  |
| ----------------------------- | -------- |
| dropped at verify (`INVALID`) | ~1.5 min |
| P4/P5, no fix round           | ~4 min   |
| P4/P5, one fix round          | 8–12 min |
| P3, one fix round             | ~11 min  |
| P2, one fix round             | ~18 min  |
| P2, two fix rounds + E2E gate | ~26 min  |

The load-bearing finding: **fix rounds dominate wall-clock, and priority sets how many you get.** A
finding that clears review first time lands in about a third the elapsed time of one that doesn't,
at the same priority. The 26-minute P2 was entirely healthy and would have tripped the table's own
`> 25 min` "investigate" threshold — so the priority caveat matters more than the thresholds do.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/543#issuecomment-5079371244) · 2026-07-25
16:56:51 UTC</sub>

## PR [\#547](https://github.com/KyleMit/Splotch/pull/547) — Audit burndown — clear the docs/AUDIT.md backlog (2026-07-26)

### ⚠️ CI note — the red Quality job on ba9b6fbf781e is an npm registry outage, not a regression

The **Audit dependencies** step (`npm audit --audit-level=critical`) failed with:

```
npm warn audit invalid json response body at https://registry.npmjs.org/-/npm/v1/security/advisories/bulk
  reason: Unexpected token '^_', "^_<gzip bytes>" is not valid JSON
npm error audit endpoint returned an error
```

npm's advisory endpoint returned a malformed body, so the command errored **before evaluating any
advisory** — this is not a vulnerability threshold being crossed.

Evidence it is external rather than caused by this branch:

* The same error reproduces right now in an unrelated sandbox on the same repo, so two independent
  environments are seeing it concurrently.
* This branch has touched **no dependency files** — `package.json` and `package-lock.json` are
  unmodified across every commit here.
* Every other gate in the same job passed: format check, type check, lint, SVG audit, agent-file
  drift, design-token drift, raw-hex token lint, asset manifest, scrapbook index. The entire
  **Tests** job also passed — unit, asset-pipeline, repo-script, E2E, and app-driver smoke.

No action taken and the burndown was not paused; the step should go green on a re-run once npm's
endpoint recovers. Flagging it here so the red X isn't read as a burndown regression.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082097394) · 2026-07-26
04:54:42 UTC</sub>
