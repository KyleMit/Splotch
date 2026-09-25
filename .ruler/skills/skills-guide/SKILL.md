---
name: skills-guide
description: Grouped catalog of every Splotch skill — what each one does and how related skills chain together (the audit lifecycle, the PR flow, ADRs, handoffs). Use when asked what skills are available, which skill fits a task, or how skills relate — and to register a skill you just created, renamed, or deleted.
---

# Skills guide

Every repo skill, grouped by the workflow it belongs to. Each skill's own `description` frontmatter
stays the canonical trigger text; this guide's job is the **grouping** and the **arrows between
skills** — which ones consult, feed, or undo each other.

## Codebase reference — consult before working in an area

Standalone lookups; none depend on another skill.

| Skill          | Covers                                                                           |
| -------------- | -------------------------------------------------------------------------------- |
| `architecture` | Tech stack, source map of `web/src/`, route table, canonical UI element glossary |
| `design`       | Design tokens, primitives, voice & copy, brand — and the public `/design` page   |
| `api`          | Every `/api/*` endpoint plus the CORS, rate-limiting, and auth model             |
| `mobile`       | Android/iOS/Capacitor toolchain, on-device testing, store-release checklists     |
| `testing`      | Three-tier test strategy (Vitest, Playwright, Maestro), commands, CI triggers    |

## Decisions — consult → weigh → document → reconcile

| Skill                   | Role in the chain                                                              |
| ----------------------- | ------------------------------------------------------------------------------ |
| `adrs`                  | Entry point: index of all ADRs; read before proposing any architectural change |
| `walk-through-decision` | Weigh an open decision in plain language: stakes, real options, one pick       |
| `create-adr`            | Document a significant decision just made — adds a new ADR                     |

`adrs` stays first for architectural decisions, and the ordering is not a formality: what has
already been decided is an input to weighing anything, which is why `walk-through-decision`'s own
grounding step sends you to `docs/adrs/` before the first trade-off is written. A decision the ADRs
have nothing to say about — a naming call, a process change, a product question — skips straight to
weighing.

`walk-through-decision` then runs *before* a decision exists: it explains one and recommends an
option, and deliberately stops there. It writes nothing and implements nothing, so recording the
outcome stays an explicit later ask to `create-adr`. The last link of the chain, `reconcile-adrs`,
lives with the other reconcile skills under Recurring maintenance.

## Performance — interaction matrices and page load

| Skill                        | Measures or drives                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `start-capture-session`      | **Start here for physical-device work** — takes the iPad/Android rig over and proves it will capture           |
| `release-capture-session`    | The mirror image — stops every rig process any checkout owns and resets the phone, for a clean next start      |
| `profiling`                  | Drawing/canvas **interaction** performance (`npm run perf:*` harness, jank, regressions)                       |
| `capture-performance-matrix` | Serial cross-target drawing, undo, and discrete-action capture across web/native targets                       |
| `improve-performance-matrix` | Freshly inventory the matrix, improve current scoreable reds, and ship causal clusters as reviewed stacked PRs |
| `audit-page-load`            | **Page-load** performance / Core Web Vitals on a throttled device; also an audit producer                      |

`capture-performance-matrix` is the capture and refresh workflow. `improve-performance-matrix`
consumes that evidence and owns the sustained improvement campaign through zero current, scoreable,
unexplained reds on the release-gate rows (a red cell with an ADR-recorded, evidence-backed
disposition counts as explained — ADR-0160) or a user-requested merge-ready wrap-up.

## Recurring maintenance — audit → vet → burn down / fix, reconcile

Recurring maintenance skills are named by family, so the prefix says what a run does (the naming
standard in the root `CLAUDE.md`): **`audit-*`** finds work and changes no code, **`burn-down-*`**
shrinks a measured count toward a target, **`reconcile-*`** brings an artifact back in line with
current reality. The audit cycle chains them: audit producers stage findings in `docs/AUDIT.md`,
`vet-audits` promotes survivors to `type:audit` GitHub issues and deletes the staging file, and
`fix-audits` works the issues — or `burn-down-audits` vets and fixes a huge staged backlog in one
unattended run. Shared rules for the producers live in `.claude/audit-conventions.md`.

### `audit-*` — find work, change no code

| Skill                     | What it finds                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `audit-code`              | Broad perf/readability/maintainability/architecture sweep → `docs/AUDIT.md`        |
| `audit-extractions`       | Inline code blocks worth extracting into named functions → `docs/AUDIT.md`         |
| `audit-page-load`         | Page-load opportunities → `docs/AUDIT.md` (primary home: Performance)              |
| `audit-session`           | End-of-session retrospective on repo friction → `docs/AUDIT.md`                    |
| `audit-dependency-health` | Provenance/license/maintenance review of every dependency → `docs/DEPENDENCIES.md` |
| `audit-agent-workflow`    | Claude Code config + session-history review vs. best practice → dated review doc   |

### Screening and fixing audit findings

`vet-audits` and `fix-audits` keep verb-noun names outside the three families: in both, "audits"
means the findings, not the act.

| Skill        | What it does                                                                    |
| ------------ | ------------------------------------------------------------------------------- |
| `vet-audits` | Adversarially validate findings; file survivors as `type:audit` issues          |
| `fix-audits` | Autonomously clear open `type:audit` issues, one commit each, on its own branch |

### `burn-down-*` — shrink a count toward its target

| Skill                             | The count it shrinks                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| `burn-down-audits`                | Staged `docs/AUDIT.md` findings — vets and fixes a huge backlog with run controls       |
| `burn-down-outdated-dependencies` | Outdated dependencies — upgraded one at a time with migration guides (user-invoke only) |
| `burn-down-dependabot-prs`        | Open Dependabot PRs — verify, sequence the merges, close the rest                       |
| `burn-down-oversized-code`        | Files or functions over the size caps — paid back down to their soft targets, one PR    |

### `reconcile-*` — bring an artifact back in line with reality

| Skill                 | What it reconciles                                                             |
| --------------------- | ------------------------------------------------------------------------------ |
| `reconcile-adrs`      | Existing ADRs against the current code and recent decisions — amends drift     |
| `reconcile-with-main` | A long-running branch against current `main`, hunting the *semantic* conflicts |

`burn-down-dependabot-prs` is the human-side pass downstream of the automated Dependabot review
(`.github/workflows/dependabot-review.yml`, `docs/DEPENDABOT.md`, and
[ADR-0081 on the Dependabot review workflow](../../../docs/adrs/0081-dependabot-claude-review-workflow.md)),
which posts an advisory verdict but never merges. It pairs with `burn-down-outdated-dependencies`
and the two do not overlap: that skill picks packages the repo is behind on and drives the bumps
itself, this one triages PRs Dependabot has already opened.

`burn-down-oversized-code` runs in `mode=files` (`max-lines`) or `mode=functions`
(`max-lines-per-function`). It is user-invoked only, because invoking it authorizes a multi-agent
fan-out: a proposer and an adversarial reviewer per unit, then an implementer per split in its own
worktree with a fresh commit checker. Its `measure.mjs` reads every cap from `eslint.config.js`.
Line limits are treated as smells: a unit that does not separate cleanly gets a per-file cap raise,
never a counter-driven split.

`reconcile-with-main` exists because a clean `git merge` proves almost nothing about a branch that
has been open a while: it detects overlapping line edits and nothing else. The skill surveys the
incoming commits before merging (the range vanishes once `main` is an ancestor), then checks them
against the branch's own changes for stranded call sites, changed contracts, and duplicated work.
Reach for it before `address-pr-review` on a stale PR — reviewer comments written against a
pre-merge diff are hard to triage until the branch is current.

## Cross-agent execution

| Skill             | Use when you are…                                                                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run-rival-agent` | **Pairing** this session, as the native handler, with the other vendor's CLI as a rival agent for an independent review it can verify through you — Codex from Claude, Claude from Codex |

One name, two packages: each provider tree carries the package that launches the *other* vendor, so
a shared skill can name `run-rival-agent` without knowing which runner it is on.

## Pull requests — author, review, respond

These augment the built-in PR flows rather than replacing them.

| Skill                     | Use when you are…                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `create-stacked-prs`      | **Sequencing** dependent changes into a chain of stacked PRs, when the user asks for one                                                 |
| `pr-screenshots`          | **Opening** a PR that touches UI — screenshot/before-after/gif conventions                                                               |
| `create-pr-review-prompt` | **Handing off** this session's PRs to an independent reviewer — builds the prompt                                                        |
| `leave-pr-review`         | **Authoring** a review — local checkout, empirical verification, posts by default                                                        |
| `address-pr-review`       | **Receiving** a review — triage every comment, fix or rebut, reply and resolve                                                           |
| `drive-pr-to-mergeable`   | **Driving** one open PR to mergeable — rival review, address, two-round bound, CI to green, verdict; never merges                        |
| `ship-issue`              | **Shipping** one issue or task end to end — implement, PR, rival review, address, drive to mergeable; merges too under `mode=autonomous` |
| `ship-campaign`           | **Campaigning** through a queue of issues unattended — each shipped and merged via `ship-issue` before the next starts from fresh `main` |
| `orchestrate-sessions`    | **Coordinating** human-relayed worker sessions — batch work, emit prompts, verify reports and evidence preservation before advancing     |

`create-stacked-prs` decides the *shape* of a chain before any single PR exists, and every later
skill in the group respects that shape while a chain is open. Stacks are opt-in: a multi-issue
campaign merges as it goes (`ship-campaign`), so reach for a stack only when the user asks for
dependent changes to land together. Its one rule — no new commit on a PR once another PR sits above
it — is why `address-pr-review` carries a stacked-campaign mode: inside an active stack it sweeps
the feedback from the whole chain and lands every fix in a single feedback PR at the tip, reused
across review rounds, instead of committing onto the reviewed branch. Read `create-stacked-prs`
first anyway — it defines the shape that mode preserves.

`create-pr-review-prompt` sits between authoring and review: at the end of a session it enumerates
every PR produced (the whole chain, in a stack), adds the session's own doubts as extra focus areas,
and emits the prompt that has an independent agent run `leave-pr-review` — full sweep first, focus
areas after. `leave-pr-review` posts its findings by default (invoking it is the authorization;
`mode=chat` and `mode=issues` redirect them), and `address-pr-review` then works the comments on the
author's side.

`drive-pr-to-mergeable` is the shared core of this group: given one open PR, it builds the reviewer
prompt with `create-pr-review-prompt`, gets the independent review from the rival agent
(`run-rival-agent`), works every thread with `address-pr-review`, runs that as a **bounded** loop —
two rounds at most, after which whatever is still open is reported as an action item rather than
chased into a third round — then drives CI to green, reconciles conflicts, and returns a
shippable-or-leftovers verdict. It never opens a PR, never merges, and never files an issue: it
drafts the follow-ups for the user. Every skill that opens PRs reaches it by name and states only
its own overrides — `create-stacked-prs` runs it on each layer while that layer is the tip,
`ship-issue` and `fix-audits` run it with no overrides, `improve-performance-matrix` makes round two
unconditional — so reviewer independence and the CI-failure policy read the same everywhere: the
rival is the reviewer (a same-runner subagent only as a named, weaker fallback), and a failure the
PR did not introduce is named in the thread and drafted, never absorbed or filed.

`ship-issue` is the single-unit pipeline through this whole group: it takes one issue number or a
free-form task, implements it, opens the PR, and hands it to `drive-pr-to-mergeable`. Both modes
take the PR all the way to **mergeable**. Invoked as `mode=autonomous` it also **merges** the PR,
but only behind a full gate — a real rival review that posted, every required check green on the
merged head, every thread resolved, nothing unpushed — and a downgraded reviewer withdraws that
authority rather than lowering the bar.

`ship-campaign` is `ship-issue mode=autonomous` in a loop, for a queue — an explicit list, an epic's
children (via `enumerate-sub-issues`), or `backlog`, the newest unclaimed issues picked one at a
time. Every unit merges before the next branches from the new `main`, so the rival reviews each
change as it lands instead of a premise compounding through a stack. What it adds is the campaign's
own discipline: a preflight run while the user is still present, quarantining a stuck unit instead
of stalling the queue, never ending the turn to ask, and a morning report verified against GitHub.
`profile=performance` wraps `improve-performance-matrix`'s causal-cluster unit.

`orchestrate-sessions` is the attended counterpart: it maintains a durable plan and gives the user
one prompt at a time to carry to separate Claude or Codex workers. Workers use `ship-issue` or
`ship-campaign`; the orchestrator verifies their pasted reports against GitHub and the underlying
preserved evidence before choosing a follow-up for that worker or the next batch. It never
implements or launches workers itself, and a merged PR does not discharge an outstanding
preservation obligation.

## Session continuity — pause ↔ resume, keep the lessons

| Skill            | Direction                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `create-handoff` | Hand off in-flight work: a copyable continuation prompt by default, a `docs/handoff/` packet on request |
| `resume-handoff` | Pick a packet back up: verify against the repo, delete it, continue the work                            |
| `self-heal`      | Sweep the session for durable lessons; write each into the home the next tripped-up session will see    |

End-of-session reflexes divide by what survives the session: in-flight *work* goes into a handoff
packet; a *lesson* with a clear fix and home is applied on the spot by `self-heal`; recurring
*friction* that needs adversarial vetting or a later fix agent is staged by `audit-session`; a
*decision* that drifted is `reconcile-adrs`' job (both under Recurring maintenance). `self-heal` is
also the general form of the audit skills' shared §3 — folding a run's method learnings back into
the skill that ran is its in-file special case.

## Running & previewing the app

| Skill                     | Use for                                                                         |
| ------------------------- | ------------------------------------------------------------------------------- |
| `run-splotch`             | Launch, drive, and screenshot the web app locally to verify a change works      |
| `cloud-preview`           | Cloud sessions only: dev server + reverse tunnel for a public phone-preview URL |
| `critique-page-inventory` | Independently review every light/night portrait/landscape inventory capture     |

## Shipping

| Skill               | Use for                                                                      |
| ------------------- | ---------------------------------------------------------------------------- |
| `cut-release`       | Draft and review notes, then bump, commit, tag, push, and create the release |
| `build`             | Build the signed release artifacts (Android `.aab`, iOS `.ipa`)              |
| `publish-artifacts` | Attach the built artifacts to the GitHub Release, verifying their versions   |

These three run **in order, and the order is load-bearing**: an artifact can only carry a version
that is already committed, so `cut-release` creates the GitHub Release with nothing attached,
`build` produces the binaries for the version it just tagged, and `publish-artifacts` attaches them
— refusing any artifact whose embedded version does not match. Attaching at release time is how
v1.4.0 shipped a 1.2.0 bundle; see ADR-0077.

## External image services

| Skill             | Use for                                                                              |
| ----------------- | ------------------------------------------------------------------------------------ |
| `vectorize-image` | Trace a bitmap to SVG/PDF/EPS/DXF/PNG through Vectorizer.AI's metered credit account |

The account is a 50-credit metered plan, so the tool defaults to Vectorizer.AI's free watermarked
test mode and spends a credit only behind an explicit flag. **This skill is a pointer, not a
package** — the driver, runbook, and inlined API documentation live in `tools/vectorize/`, so the
bulk is not copied into both `.claude/` and `.agents/` on every Ruler run. It is standalone: the
asset-generation pipeline in `tools/asset-gen/` (AI line art and fills) is unrelated and documents
its own decisions under `tools/asset-gen/docs/`.

## Repo hygiene & meta

| Skill                         | Use for                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `enumerate-sub-issues`        | Enumerate an epic's children from the sub-issues API, classify, and order them |
| `prune-git-workspace`         | Salvage and prune agent worktrees, delete dead local branches, triage `origin` |
| `analyze-session-transcripts` | Mine past local session transcripts into factual, evidence-anchored reports    |
| `skills-guide`                | This guide                                                                     |

`analyze-session-transcripts` has independent registered Claude and Codex packages because their
session stores and record envelopes differ. It is user-invoked only — a batch run spawns a subagent
per session, so it never fires on model initiative.

`prune-git-workspace` runs three cleanups in a fixed order — worktrees, then local branches, then
remote branches — because each frees something the next one classifies. Its scripts under
`tools/git-housekeeping/` are dry runs by default; the local-branch judgment pass exists to give any
finding on an unmerged branch a durable home (an issue, an ADR via `create-adr`, a scratchpad note —
the `self-heal` judgment) *before* the branch goes, and the remote pass still hands the user a
deletion script rather than deleting `origin` refs itself.

## Keeping this guide current

Every skill must appear here in exactly one primary group (cross-reference a second group in prose
when a skill genuinely spans two, as `audit-page-load` does). Most skills are generated from
`.ruler/skills/` or `.ruler/skill-forks/`. Direct packages are registered in
`tools/ruler/lib/direct-provider-skills.mjs`: `burn-down-audits` has independent Claude and Codex
implementations, as do `analyze-session-transcripts` and `run-rival-agent` (each package launching
the other vendor). When editing one, change only the declared provider; never copy one
implementation into an undeclared provider tree.

**When you add, rename, or delete a skill, update this guide in the same change**, then run
`npm run ruler:apply` for generated surfaces. If a new skill fits no existing group, add a group
rather than forcing it into one.

Naming: workflow skills (perform a procedure with side effects) get verb-noun names (`create-adr`,
`fix-audits`); reference skills (only load knowledge) get plain noun names (`architecture`, `adrs`).
A recurring maintenance skill takes a family prefix — `audit-*`, `burn-down-*`, or `reconcile-*` —
only when that prefix is honest about what its run does. The name alone should tell you whether
invoking the skill is passive or starts a procedure — see the skill-naming standard in the root
`CLAUDE.md`.
