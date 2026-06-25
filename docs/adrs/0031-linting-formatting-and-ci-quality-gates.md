# ADR-0031: Linting, Formatting, and CI Quality Gates

**Status:** Active
**Date:** 2026-06

## Context

Splotch enforced its conventions (Svelte 5 runes only and no legacy stores —
ADR-0002; TypeScript everywhere — ADR-0003; cross-platform scripts — ADR-0017)
by review vigilance alone. There was no linter or formatter, and CI
(`.github/workflows/test.yml`) ran the unit + E2E tests but never type-checked,
so a `svelte-check` regression could land on `main`. `docs/BACKLOG.md` explicitly
asked whether to "add a linter or formatter". As an AI-assisted codebase, the
cost of an inconsistency slipping through is higher than usual, and the
conventions are exactly the kind a machine can enforce cheaply.

## Decision

Adopt **ESLint** (flat config) + **Prettier**, plus a CI `quality` job, with
these deliberate choices:

- **ESLint runs without a TypeScript program.** `svelte-check` (`npm run check`)
  already owns type checking; ESLint uses `typescript-eslint` + `eslint-plugin-svelte`
  in their non-type-checked modes. This keeps lint fast and tolerant of the
  toolchain (notably TypeScript 6, ahead of typescript-eslint's official support
  window) — type errors are not ESLint's job.
- **Conventions are encoded as rules where lintable.** `no-restricted-imports`
  bans `svelte/store` (the runes-only rule, ADR-0002). A few rules are relaxed
  for genuine framework idioms rather than worked around in source: empty `catch`
  is allowed (best-effort pointer-capture calls in the engine), bare member reads
  inside `$effect` (reactive dependency tracking) are allowed, and
  `svelte/no-navigation-without-resolve` is off (the app has no base path).
  Intentional `{@html}` (first-party icons / build-time Markdown) carries a
  justified per-line disable so the security rule keeps its value elsewhere.
- **Prettier matches the existing style** (2-space, single-quote, width 100,
  `trailingComma: es5`). Adopting it meant a one-time reformat of `web/src` and
  `scripts`; it is scoped to source — Markdown (ADRs) and `package.json` (whose
  `scripts-info` order is meaningful, ADR-0019) are left alone.
- **Enforcement is CI-only — no pre-commit hook.** No husky/lint-staged: it
  avoids an extra install step and an `install`-time `prepare` script, and keeps
  the local loop friction-free. The `quality` job is the gate.
- **The dependency-audit gate is `critical` only.** `npm audit` reports a large
  pre-existing transitive count (ADR-0029), mostly build-time and unfixable; a
  `high` gate would make CI perpetually red and be ignored. Instead CI
  hard-fails only on `critical` severities — rare and genuinely worth blocking a
  release for.
- **`precheck` runs `svelte-kit sync`** so `npm run check` generates
  `.svelte-kit/tsconfig.json` and works standalone in CI (mirrors `predev`).

New scripts: `lint`, `lint:fix`, `format`, `format:check` (with `scripts-info`
entries, ADR-0019). The `quality` job runs type-check + lint + format:check +
audit on every push/PR, parallel to the existing `test` job.

## Consequences

- + The runes-only / no-legacy-store rule and formatting are now enforced
  mechanically, not by reviewer memory — the question `BACKLOG.md` raised is
  resolved.
- + CI type-checks every change; a `svelte-check` regression can no longer reach
  `main`.
- + Splitting ESLint (style/correctness) from svelte-check (types) keeps linting
  fast and immune to TypeScript-version skew with typescript-eslint.
- + Dependabot turns the static vulnerability count into a steady stream of small,
  reviewable update PRs instead of a one-off audit chore.
- − A one-time Prettier reformat touched most source files; future `git blame`
  crosses that commit (isolated as a single `style:` commit to make it skippable).
- − The `critical`-only audit gate does not block high/moderate advisories; that
  is delegated to Dependabot review, by design, to keep the gate meaningful.
- − No pre-commit hook means a contributor can commit lint/format violations
  locally; CI catches them, at the cost of a round-trip. Run `npm run lint` and
  `npm run format` (or `lint:fix`) before pushing.
