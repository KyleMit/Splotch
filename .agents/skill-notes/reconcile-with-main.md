<!-- Source: .ruler/skill-notes/reconcile-with-main.md.template -->

# reconcile-with-main — design notes

## The failure this exists to prevent

Not a merge conflict. The opposite: the agent runs `git merge origin/main`, git reports no
conflicts, and the agent reports success. Every genuinely dangerous interaction between a stale
branch and a moved `main` is invisible to that check, because git's conflict detector only looks for
overlapping line edits. A call site added on the branch *after* the merge base can never conflict
with an upstream rename — upstream never touched a line that did not exist yet.

The wording in the skill is doing specific work. "Deal with conflicts" is read as "git conflicts",
and when there are none the instruction is satisfied and the agent stops. So the skill states the
inversion twice, in the opening and again in Step 6: a clean merge is the starting condition, and an
unmentioned report bucket reads as "not checked".

## Why the survey runs before the merge

`<merge-base>..origin/main` is empty the moment `origin/main` becomes an ancestor of `HEAD`. Every
later attempt to answer "what came in?" has to reconstruct the range from reflog or the merge
commit's second parent, which is both fiddlier and easy to get subtly wrong. Collecting it up front
is one command and cannot be misordered. That is the entire reason `survey.mjs` exists rather than a
list of git invocations in prose — the ordering constraint is the part an agent would silently get
wrong, and prose does not enforce ordering.

The two-sweep split in Step 3 (both-sides files vs. upstream-only changes) is the same concern:
sweep A is where an agent naturally looks, sweep B is where the stranded call sites actually are,
and without naming them separately only sweep A gets done.

## The rename hole (found in review of the first version)

The first `survey.mjs` keyed the both-sides overlap on `git diff --name-only`, one path per change.
That drops the single most dangerous case: upstream renames `foo.js` → `bar.js`, the branch edits
`foo.js`, git follows the rename and lands both edits in `bar.js` without a conflict — and the
survey reported `bar.js` as upstream-only, `foo.js` as local-only, and no overlap at all. The file
guaranteed to need reading was the one file the report said nothing about.

The fix is to treat a rename as one logical file with two names: every entry contributes both of its
names to an identity set, and a match on either name counts as an overlap. It is symmetric on
purpose — the branch renaming a file upstream edited is the same bug in the other direction, and the
first version would have missed that too.

Worth noting for anyone extending this: the classification is now the only thing standing between
sweep A and a silent miss, so `classifyChanges` is pure and unit-tested against raw `--name-status`
output (`tools/tests/reconcile-survey.test.mjs`) rather than being reachable only through a live
repo.

## Rejected

* **An alternate `--base` flag on the survey.** The first version had one. It was incoherent: the
  skill's other steps name `origin/main` directly — the merge, the ADR log check, the report — so
  `--base release` would have surveyed one incoming range and then merged and reviewed a different
  one, producing a confident report about the wrong branch. Threading a base through every step was
  the alternative; rejected because a skill named `reconcile-with-main` earns its clarity from being
  main-specific, and a general "reconcile against any base" tool is a different thing with different
  Step 4 traps.
* **Rebase instead of merge.** A long-running branch is the case this skill targets, and by
  definition it is pushed and often reviewed. Rebasing rewrites history a reviewer has read. It also
  destroys the legibility the skill depends on — after a rebase there is no incoming set to report
  on. Left as a user-requested override rather than a default.
* **Making it a `git` alias or a script that does the merge.** The merge is the trivial part. The
  value is entirely in the review pass, which cannot be scripted — so the helper deliberately stops
  at gathering facts and never moves a ref.

## Push after verification (2026-09-30)

The initial version excluded pushing. During the section-structure polish PR, the agent followed
that rule, completed and verified the merge, and left it local until the user separately requested a
push. The user identified the skill's rule as the problem and asked to change it: "it's fine to
push".

Reconciliation includes committing and normally pushing the verified result to the branch's
upstream, publishing to `origin` if there is no upstream. Separate push permission is unnecessary;
an explicit local-only request still takes precedence. Required verification remains before the
push, and the final report includes its outcome.

## The relation verdict (2026-09-28)

The survey grades the incoming commits `unrelated`, `adjacent`, or `coupled` before the merge. The
user asked for this after a 64-PR campaign, noting that the full pass "can also sometimes be a bit
noisy if the changes are genuinely unrelated". `ship-campaign`'s parallel mode uses the verdict at
every catch-up merge.

**How far to follow imports.** A rival review asked for ordinary transitive imports to be followed.
Measured against the campaign's 65 merges into `main`, on 61 sampled `web/src/lib` modules, this is
the share of merges that would read as `adjacent`:

| Imports followed                    | Share of merges flagged `adjacent` |
| ----------------------------------- | ---------------------------------- |
| Direct imports only                 | 3.0%                               |
| Plus one hop behind a direct import | 6.1%                               |
| The full transitive closure         | 14.4%                              |

Hub-reaching modules are where the full closure hurts. `aiAutoSave.ts` has 288 modules in its
closure, and 48 of 65 merges touched it, against 9 at one hop and 4 at direct imports only.

**Chosen: one hop.** It catches the rival's concrete case (`tool.svelte.ts` imports `storage.ts`,
which imports `nativePlugin.ts`) and roughly doubles the rate over direct imports only. Following
the full closure would turn three-quarters of a hub module's merges into `adjacent`, each with a
long reading list: the noise the verdict exists to remove.

Deeper paths keep each intermediate's interface, which the type check verifies, and their behaviour
is covered by the tests every path runs. What remains is a known limit: a new call through two
unchanged intermediates whose behaviour upstream changed indirectly. It is left to the tests, and to
the rule that a failing check escalates the merge to `coupled`.

**Rival findings adopted:**

* the dependency forms (barrels, followed transitively; `import.meta.glob`; `?raw` suffixes);
* keeping a deleted `Foo.svelte` distinct from an edited `Foo.svelte.ts`;
* accumulating every changed target of a barrel, even one that itself changed;
* the one-hop bound;
* the orchestrator re-reading a PR's live review state before it merges (in `ship-campaign`'s
  parallel mode).

## Open

* The Step 4 trap list is repo-specific and will rot as the repo changes. It is written as "check
  these by name" rather than "these are the only ones", but nothing enforces that it stays current —
  a candidate for a `audit-session` finding if a merge ever goes wrong in a way Step 4 should have
  named.
* `survey.mjs` reports renames and deletions but not signature changes, which are the highest-value
  and hardest-to-detect class in the Step 3 table. Detecting them properly means diffing exported
  symbols, which needs type information. Left to the agent's reading for now.
