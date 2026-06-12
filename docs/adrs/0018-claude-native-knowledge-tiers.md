# ADR-0018: Project Knowledge in Claude Code-Native Tiers (Skills, Rules, Nested CLAUDE.md)

**Status:** Active
**Date:** 2026-06

## Context

Project knowledge lived in four large reference docs (`docs/ARCHITECTURE.md`,
`docs/API.md`, `docs/MOBILE.md`, `docs/TESTING.md`, ~850 lines combined) plus a
root `CLAUDE.md` whose main job was a table telling Claude when to go read
each one. That worked, but every consultation was a manual full-file read, the
instructions had no scoping (testing conventions loaded the same way whether
the session touched tests or not), and the "when to read it" routing depended
on Claude remembering to follow the table.

Alternatives considered:

* **Keep the flat `docs/` layout with the pointer table.** Status quo;
  rejected because routing was advisory only and every lookup cost a full
  manual read with no automatic triggering.
* **`@path` imports in CLAUDE.md.** Would inline the docs into every session;
  rejected because imports load at launch, so ~850 lines of reference material
  would consume context in sessions that never touch the topic.
* **Claude Code-native tiers** (chosen): content loads always, on path match,
  or on demand, matching how often each kind of knowledge is needed.

## Decision

Organize instructions into three loading tiers:

1. **Always loaded** — root `CLAUDE.md`, trimmed to what every session needs:
   project overview, the `CAPACITOR=true` dual-build rule, key commands, core
   conventions, and a map of where everything else lives.
2. **Loaded on path match** — `.claude/rules/*.md` with `paths` frontmatter
   (`svelte.md`, `server-api.md`, `testing.md`) for invariants that must hold
   whenever matching files are touched, plus nested `CLAUDE.md` files in
   `src/`, `android/`, and `scripts/` for directory-local orientation. Rules
   are used where the scope can't be expressed as one directory — e.g.
   testing spans `src/**/*.test.ts` and `tests/**`.
3. **Loaded on demand** — `.claude/skills/<name>/SKILL.md` for reference
   material needed only when the topic comes up: `architecture`, `api`,
   `mobile`, `testing`, plus a thin `adrs` skill that routes to the ADR
   index. The four reference docs moved here verbatim (still
   committed, still human-readable markdown); the skill `description`
   frontmatter is the routing that the old pointer table did by hand.

Invariants:

* A converted doc has **one** home. The old `docs/*.md` files were deleted,
  not stubbed, and all references (README, CONTRIBUTING, ADRs 0015–0017)
  point at the `.claude/skills/` locations. Don't recreate
  `docs/ARCHITECTURE.md` etc.
* Reference content that changes with the code (e.g. the API surface) is
  updated in its SKILL.md as part of the same change — the `server-api.md`
  rule encodes this for endpoints.
* `docs/` retains only human-process artifacts: `adrs/`, `CONTRIBUTING.md`,
  `BACKLOG.md`, `PROMPTS.md`, and the generated `TODO.md`.

## Consequences

* **+** Context is spent proportionally to relevance: a CSS tweak session no
  longer carries the Android toolchain guide, while an `/api` change gets the
  server rules injected automatically instead of relying on Claude to follow
  a pointer.
* **+** Path rules make the critical invariants (CORS wildcard safety,
  rate-limiting, runes-only) load deterministically when matching files are
  edited, rather than hoping the right doc was consulted.
* **+** Skill descriptions give Claude a routable index; `/architecture`,
  `/api`, `/mobile`, `/testing` are also directly invocable by the user.
* **-** Project knowledge now lives in two places (`docs/` and `.claude/`),
  and `.claude/skills/` is less discoverable to humans browsing GitHub than
  `docs/` was.
* **-** The layout is Claude Code-specific. Other coding agents (AGENTS.md
  conventions, Cursor rules) won't auto-discover skills or path rules; if
  another tool is adopted, the content is plain markdown but the routing
  metadata would need translating.
* **-** Contributors editing endpoints or toolchain steps must know to update
  a SKILL.md under `.claude/` — a less obvious home for documentation than
  `docs/`.
