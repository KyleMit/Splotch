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
| `design`       | Design tokens, primitives in `lib/components/design/`, styling rules             |
| `api`          | Every `/api/*` endpoint plus the CORS, rate-limiting, and auth model             |
| `mobile`       | Android/iOS/Capacitor toolchain, on-device testing, store-release checklists     |
| `testing`      | Three-tier test strategy (Vitest, Playwright, Maestro), commands, CI triggers    |

## ADRs — consult → document → reconcile

| Skill         | Role in the chain                                                              |
| ------------- | ------------------------------------------------------------------------------ |
| `adrs`        | Entry point: index of all ADRs; read before proposing any architectural change |
| `create-adr`  | Document a significant decision just made — adds a new ADR                     |
| `update-adrs` | End-of-session sweep: verify existing ADRs still match reality, amend drift    |

## Performance — two harnesses for two kinds of slow

| Skill              | Measures                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `profiling`        | Drawing/canvas **interaction** performance (`npm run perf:*` harness, jank, regressions)  |
| `lighthouse-audit` | **Page-load** performance / Core Web Vitals on a throttled device; also an audit producer |

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
| Standalone | `dependency-update-audit` | Upgrade dependencies one at a time with migration guides (user-invoke only)        |
| Standalone | `dependency-health-audit` | Provenance/license/maintenance review of every dependency → `docs/DEPENDENCIES.md` |
| Standalone | `workflow-audit`          | Claude Code config + session-history review vs. best practice → dated review doc   |

## Pull requests — author, review, respond

All three augment the built-in PR flows rather than replacing them.

| Skill               | Use when you are…                                                               |
| ------------------- | ------------------------------------------------------------------------------- |
| `pr-screenshots`    | **Opening** a PR that touches UI — screenshot/before-after/gif conventions      |
| `leave-pr-review`   | **Authoring** a review of someone's PR — local checkout, empirical verification |
| `address-pr-review` | **Receiving** a review — triage every comment, fix or rebut, reply and resolve  |

## Session continuity — pause ↔ resume

| Skill            | Direction                                                                    |
| ---------------- | ---------------------------------------------------------------------------- |
| `create-handoff` | Write a transfer packet to `docs/handoff/` before stopping in-flight work    |
| `resume-handoff` | Pick a packet back up: verify against the repo, delete it, continue the work |

## Running & previewing the app

| Skill           | Use for                                                                         |
| --------------- | ------------------------------------------------------------------------------- |
| `run-splotch`   | Launch, drive, and screenshot the web app locally to verify a change works      |
| `cloud-preview` | Cloud sessions only: dev server + reverse tunnel for a public phone-preview URL |

## Shipping

| Skill     | Use for                                                                  |
| --------- | ------------------------------------------------------------------------ |
| `build`   | Build the signed release artifacts (Android `.aab`, iOS `.ipa`)          |
| `release` | Draft release notes from the git log, bump versions, publish the release |

## Repo hygiene & meta

| Skill                   | Use for                                                                  |
| ----------------------- | ------------------------------------------------------------------------ |
| `prune-remote-branches` | Triage stale `origin` branches and hand back an approved deletion script |
| `skills-guide`          | This guide                                                               |

## Keeping this guide current

Every skill in `.ruler/skills/` must appear here, in exactly one primary group (cross-reference a
second group in prose when a skill genuinely spans two, as `lighthouse-audit` does). **When you add,
rename, or delete a skill, update this guide in the same change**, then run `npm run ruler:apply`.
If a new skill fits no existing group, add a group rather than forcing it into one.

Naming: workflow skills (perform a procedure with side effects) get verb-noun names (`create-adr`,
`fix-audits`); reference skills (only load knowledge) get plain noun names (`architecture`, `adrs`).
The name alone should tell you whether invoking the skill is passive or starts a procedure — see the
skill-authoring guidance in the root `CLAUDE.md`.
