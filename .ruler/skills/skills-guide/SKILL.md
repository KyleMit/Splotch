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

## ADRs — consult → document → reconcile

| Skill         | Role in the chain                                                              |
| ------------- | ------------------------------------------------------------------------------ |
| `adrs`        | Entry point: index of all ADRs; read before proposing any architectural change |
| `create-adr`  | Document a significant decision just made — adds a new ADR                     |
| `update-adrs` | End-of-session sweep: verify existing ADRs still match reality, amend drift    |

## Performance — interaction matrices and page load

| Skill                        | Measures or drives                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `start-capture-session`      | **Start here for physical-device work** — takes the iPad/Android rig over and proves it will capture           |
| `profiling`                  | Drawing/canvas **interaction** performance (`npm run perf:*` harness, jank, regressions)                       |
| `capture-performance-matrix` | Serial cross-target drawing, undo, and discrete-action capture across web/native targets                       |
| `improve-performance-matrix` | Freshly inventory the matrix, improve current scoreable reds, and ship causal clusters as reviewed stacked PRs |
| `lighthouse-audit`           | **Page-load** performance / Core Web Vitals on a throttled device; also an audit producer                      |

`capture-performance-matrix` is the capture and refresh workflow. `improve-performance-matrix`
consumes that evidence and owns the sustained improvement campaign through zero current, scoreable
reds or a user-requested merge-ready wrap-up.

## Audit lifecycle — produce → vet → fix

The pipeline behind `docs/AUDIT.md`; shared rules live in `.claude/audit-conventions.md`. Producers
stage findings, `vet-audits` promotes survivors to `type:audit` GitHub issues and deletes the
staging file, `fix-audits` burns the issues down.

| Stage      | Skill                     | What it does                                                                       |
| ---------- | ------------------------- | ---------------------------------------------------------------------------------- |
| Produce    | `code-audit`              | Broad perf/readability/maintainability/architecture sweep → `docs/AUDIT.md`        |
| Produce    | `extract-audit`           | Inline code blocks worth extracting into named functions → `docs/AUDIT.md`         |
| Produce    | `lighthouse-audit`        | Page-load opportunities → `docs/AUDIT.md` (also listed under Performance)          |
| Produce    | `session-audit`           | End-of-session retrospective on repo friction → `docs/AUDIT.md`                    |
| Vet        | `vet-audits`              | Adversarially validate findings; file survivors as `type:audit` issues             |
| Fix        | `fix-audits`              | Autonomously clear open `type:audit` issues, one commit each, on its own branch    |
| Vet + fix  | `burn-down-audits`        | Iteratively clears a huge `docs/AUDIT.md` with durable progress and run controls   |
| Standalone | `dependency-update-audit` | Upgrade dependencies one at a time with migration guides (user-invoke only)        |
| Standalone | `dependency-health-audit` | Provenance/license/maintenance review of every dependency → `docs/DEPENDENCIES.md` |
| Standalone | `workflow-audit`          | Claude Code config + session-history review vs. best practice → dated review doc   |

## Cross-agent execution

| Skill             | Use when you are…                                                                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run-rival-agent` | **Pairing** this session, as the native handler, with the other vendor's CLI as a rival agent for an independent review it can verify through you — Codex from Claude, Claude from Codex |

One name, two packages: each provider tree carries the package that launches the *other* vendor, so
a shared skill can name `run-rival-agent` without knowing which runner it is on.

## Pull requests — author, review, respond

These augment the built-in PR flows rather than replacing them.

| Skill                     | Use when you are…                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `create-stacked-prs`      | **Sequencing** a multi-issue campaign into a chain of stacked PRs                       |
| `pr-screenshots`          | **Opening** a PR that touches UI — screenshot/before-after/gif conventions              |
| `create-pr-review-prompt` | **Handing off** this session's PRs to an independent reviewer — builds the prompt       |
| `leave-pr-review`         | **Authoring** a review — local checkout, empirical verification, posts by default       |
| `address-pr-review`       | **Receiving** a review — triage every comment, fix or rebut, reply and resolve          |
| `implement-issue-stack`   | **Orchestrating** ordered issues into reviewed, green stacked PRs via `run-rival-agent` |
| `triage-dependabot-prs`   | **Clearing** the open Dependabot PRs — verify, sequence the merges, close the rest      |

`create-stacked-prs` comes first in that table for a reason: it decides the *shape* of the campaign
before any single PR exists, and every later skill in the group has to respect that shape. Its one
rule — no new commit on a PR once another PR sits above it — is why `address-pr-review` carries a
stacked-campaign mode: inside an active stack it sweeps the feedback from the whole chain and lands
every fix in a single feedback PR at the tip, reused across review rounds, instead of committing
onto the reviewed branch. Read `create-stacked-prs` first anyway — it defines the shape that mode
preserves. `implement-issue-stack` is the unattended Codex orchestrator for the same shape; this one
is the by-hand procedure, in either agent.

`create-pr-review-prompt` sits between authoring and review: at the end of a session it enumerates
every PR produced (the whole chain, in a stack), adds the session's own doubts as extra focus areas,
and emits the prompt that has an independent agent run `leave-pr-review` — full sweep first, focus
areas after. `leave-pr-review` posts its findings by default (invoking it is the authorization;
`mode=chat` and `mode=issues` redirect them), and `address-pr-review` then works the comments on the
author's side.

`triage-dependabot-prs` is the human-side pass downstream of the automated Dependabot review
(`.github/workflows/dependabot-review.yml`, `docs/DEPENDABOT.md`, and
[ADR-0081 on the Dependabot review workflow](../../../docs/adrs/0081-dependabot-claude-review-workflow.md)),
which posts an advisory verdict but never merges. It pairs with `dependency-update-audit` in the
audit table above and the two do not overlap: that skill picks packages the repo is behind on and
drives the bumps itself, this one triages PRs Dependabot has already opened.

## Session continuity — pause ↔ resume, keep the lessons

| Skill            | Direction                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `create-handoff` | Hand off in-flight work: a copyable continuation prompt by default, a `docs/handoff/` packet on request |
| `resume-handoff` | Pick a packet back up: verify against the repo, delete it, continue the work                            |
| `self-heal`      | Sweep the session for durable lessons; write each into the home the next tripped-up session will see    |

End-of-session reflexes divide by what survives the session: in-flight *work* goes into a handoff
packet; a *lesson* with a clear fix and home is applied on the spot by `self-heal`; recurring
*friction* that needs adversarial vetting or a later fix agent is staged by `session-audit` (audit
table above); a *decision* that drifted is `update-adrs`' job (ADR group). `self-heal` is also the
general form of the audit skills' shared §3 — folding a run's method learnings back into the skill
that ran is its in-file special case.

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

| Skill                         | Use for                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `burn-down-backlog`           | Claim the newest unclaimed open issue (`in-progress` label) and drive it to a push |
| `enumerate-sub-issues`        | Enumerate an epic's children from the sub-issues API, classify, and order them     |
| `reconcile-with-main`         | Merge current `main` into a long-running branch and hunt the *semantic* conflicts  |
| `prune-remote-branches`       | Triage stale `origin` branches and hand back an approved deletion script           |
| `analyze-session-transcripts` | Mine past local session transcripts into factual, evidence-anchored reports        |
| `skills-guide`                | This guide                                                                         |

`analyze-session-transcripts` has independent registered Claude and Codex packages because their
session stores and record envelopes differ. It is user-invoked only — a batch run spawns a subagent
per session, so it never fires on model initiative.

`reconcile-with-main` exists because a clean `git merge` proves almost nothing about a branch that
has been open a while: it detects overlapping line edits and nothing else. The skill surveys the
incoming commits before merging (the range vanishes once `main` is an ancestor), then checks them
against the branch's own changes for stranded call sites, changed contracts, and duplicated work.
Reach for it before `address-pr-review` on a stale PR — reviewer comments written against a
pre-merge diff are hard to triage until the branch is current.

## Keeping this guide current

Every skill must appear here in exactly one primary group (cross-reference a second group in prose
when a skill genuinely spans two, as `lighthouse-audit` does). Most skills are generated from
`.ruler/skills/` or `.ruler/skill-forks/`. Direct packages are registered in
`tools/ruler/lib/direct-provider-skills.mjs`: `burn-down-audits` has independent Claude and Codex
implementations, as do `analyze-session-transcripts` and `run-rival-agent` (each package launching
the other vendor); `implement-issue-stack` is Codex-only. When editing one, change only the declared
provider; never copy one implementation into an undeclared provider tree.

**When you add, rename, or delete a skill, update this guide in the same change**, then run
`npm run ruler:apply` for generated surfaces. If a new skill fits no existing group, add a group
rather than forcing it into one.

Naming: workflow skills (perform a procedure with side effects) get verb-noun names (`create-adr`,
`fix-audits`); reference skills (only load knowledge) get plain noun names (`architecture`, `adrs`).
The name alone should tell you whether invoking the skill is passive or starts a procedure — see the
skill-authoring guidance in the root `CLAUDE.md`.
