# Handoff — Tier 1 image regeneration pass

> 2026-07-13 · branch `codex/image-gen-tier1-20260713` · PR
> [#143](https://github.com/KyleMit/Splotch/pull/143) · independently burn down the nine 2026-07-13
> Tier 1 image-output issues without touching Claude's PR #142

## Objective & non-goals

Work `tools/asset-gen/docs/ISSUES.md` Tier 1 in its original order, one issue and one sub-agent at a
time. Revalidate every page on the shipped **chalk-over-night composite** before spending Gemini
budget; use each page's seeded `fill-src/<cat>/notes.json` retry recipe; ship accepted source raws
and deterministic derivatives; refresh golden fixtures and the asset manifest in the same commit;
and add a detailed PR #143 comment with hosted before/after crops after every processed issue.

Non-goals:

* Do not touch Tiers 2–4.
* Do not use, cherry-pick, comment on, push to, or otherwise coordinate through
  [PR #142](https://github.com/KyleMit/Splotch/pull/142). Claude owns that concurrent pass.
* Do not reuse #142's generated assets or newly discovered page notes. This is an independent pass
  from the seeded state on `feat/image-gen-v5`.
* Do not exceed the user's soft cap of 5 generations per variant or hard cap of 10 generations per
  issue. If the fix is not worth further complexity, leave it open and explain why in PR #143.

## State

* Base: `origin/feat/image-gen-v5` at `753d31e` when the branch was created.
* Working branch: `codex/image-gen-tier1-20260713`.
* Draft PR: [#143](https://github.com/KyleMit/Splotch/pull/143).
* Clean isolated worktree used by this session: `/private/tmp/splotch-tier1-codex`.
* `node_modules` is an untracked symlink in that worktree; stage explicit paths only.
* `GEMINI_API_KEY` was found in the ignored original-checkout file
  `/Users/kylemit/Code/Splotch/web/.env`. Never print it. The user explicitly approved sending the
  repository coloring-page images and seeded prompt notes to Google Gemini using that key.

| Commit    | What                                                      |
| --------- | --------------------------------------------------------- |
| `5392537` | Empty anchor commit that opened independent draft PR #143 |

Before this handoff commit, PR #143 had **no changed files, no asset commits, and no generated
scratch files**. Original Tier 1 #1 is the next work item.

### Accidental PR #142 overlap — context only, never resume there

This session initially mistook the already-open exact-match PR #142 for the requested new PR. It
pushed one independent asset commit there:

* `37638ea` — a first-take `vehicles/garbage-tall` night regen, plus
  [comment](https://github.com/KyleMit/Splotch/pull/142#issuecomment-4963630343) and pr-assets
  commit `2727017`.

Claude subsequently superseded that asset with `4317295` on #142. Other Codex candidates for
excavator and chalk-invented faces remained uncommitted in a temporary worktree that was deleted. Do
not clean up, amend, or import anything from #142; further mutation would interfere with Claude's
active work.

## Decisions made (and why)

* **PR #143 is the only working surface.** The user explicitly wants Codex and Claude independent.
  Every remote-head guard, push, comment, body edit, and evidence path must name #143.
* **Restart from original issue #1.** Nothing learned from #142 counts as a shipped result in this
  pass. Start from the seeded notes on PR #143 and independently judge fresh composites.
* **Use `pr-assets/tier1-fixes-pr143/` for evidence.** This keeps hosted crops disjoint from #142's
  `tier1-fixes-pr142/` folder.
* **Composite review owns the verdict.** The listed defects pass automated gates; raw fill scores
  cannot substitute for the chalk-over-night composite.
* **Contact sheets are mandatory after asset changes.** Publish with the Artifact tool if the next
  environment has it. This Codex session did not; in that case build the self-contained local sheet
  and inspect exact composites/crops, while the hosted PR crops remain the durable review evidence.
* **Use a fresh remote-head guard before every issue commit.** Concurrent work caused repeated
  collisions on #142; PR #143 should remain isolated, but verify rather than assume.

## Unverified assumptions

* `origin/feat/image-gen-v5` may advance before resume. Fetch and confirm whether PR #143 needs a
  rebase before generating anything.
* The ignored `web/.env` and its Gemini key may not exist in the next environment; verify presence
  without printing values.
* No Artifact publisher was available in this Codex environment. The next session may have one.

## Done & verified

* Draft [PR #143](https://github.com/KyleMit/Splotch/pull/143) exists with base `feat/image-gen-v5`,
  head `codex/image-gen-tier1-20260713`, and anchor `5392537`.
* `gh pr view 143` showed no changed files before this handoff; CI `Quality` and `Tests` both
  passed.
* `git status` in the isolated worktree showed no tracked changes; only the intentional untracked
  `node_modules` symlink.
* Both `.coloring-samples/` trees were checked and contained no PR #143 generation output.
* The issue-#1 sub-agent was interrupted immediately when the user requested this handoff. No PR
  #143 Gemini generation, asset edit, commit, push, evidence upload, or PR comment occurred.
* The original dirty checkout at `/Users/kylemit/Code/Splotch` was preserved. An accidental empty
  local `main` commit was removed with `git reset --soft`; no user file was committed or discarded.
* No asset checks are claimed for PR #143 because no asset work has started.

## Risks & next 3 steps

1. Run `/resume-handoff`, fetch PR #143, verify its base/head/checks and that Tier 1 still starts
   with the two dinosaur night-eye pages. Treat any #142 state as out of scope.
2. Spawn exactly one sub-agent for original Tier 1 #1. Revalidate both current dinosaur composites,
   apply only seeded recipes initially, respect the 10-generation issue cap, then re-punch, rebuild
   the dinosaur sheet, run golden diff → freeze + manifest, checks, and commit/push to PR #143.
3. Upload focused crops under `pr-assets/tier1-fixes-pr143/`, post the detailed #143 comment, update
   its checkbox, and only then start original issue #2 with the next single sub-agent.

Risks: accidentally targeting #142 again; treating gate-green raws as visual proof; exceeding the
grouped-issue hard cap; staging the `node_modules` symlink; omitting the golden freeze/manifest
pair; or leaving seeded notes stale after discovering a new lever.

## Reread first

* [`tools/asset-gen/AGENTS.md`](../../tools/asset-gen/AGENTS.md)
* [`tools/asset-gen/docs/README.md`](../../tools/asset-gen/docs/README.md)
* [`tools/asset-gen/docs/pipeline.md`](../../tools/asset-gen/docs/pipeline.md)
* [`tools/asset-gen/docs/ISSUES.md`](../../tools/asset-gen/docs/ISSUES.md)
* [`tools/asset-gen/lib/page-notes.mjs`](../../tools/asset-gen/lib/page-notes.mjs)
* [`pr-screenshots` skill](../../.agents/skills/pr-screenshots/SKILL.md)
* [`resume-handoff` skill](../../.agents/skills/resume-handoff/SKILL.md)
