---
description: Audit package.json dependencies for updates (incl. majors), then upgrade them one at a time — read the migration guide, fix all usage, verify, and commit each on its own
argument-hint: "[package-name] (optional — limit the run to a single dependency)"
disable-model-invocation: true
---

Bring the project's dependencies up to date **deliberately**: one package at a
time, each backed by its migration guide, with every usage in the codebase
checked and a clean commit per upgrade.

There is **one root `package.json`** for the whole repo (web + Capacitor native);
the SvelteKit app lives in `web/` but its dependencies are declared at the root
(see `CLAUDE.md`). Run npm tooling from the repo root.

If an argument is given, scope the entire run to just that one package and skip
straight to step 3 for it.

## Phase 1 — Survey (no changes yet)

1. **List what's behind.** Run `npm outdated` (it exits non-zero when anything is
   outdated — that's expected, not a failure). Capture, for each package, the
   **current**, **wanted**, and **latest** versions, and whether it's a `prod`
   or `dev` dependency.
2. **Classify each.** For every outdated package decide the jump:
   - **Patch/minor within range** (`wanted` move) — low risk.
   - **Major** (`latest` > `wanted`, crosses a major) — needs a migration guide
     and a usage audit.
3. **Flag the landmines** before touching anything. Call out packages where an
   upgrade is known to be entangled with this repo's setup:
   - **`@capacitor/*` and `@capacitor/cli`** — `@capacitor/cli` is patched via
     `patch-package` (`patches/`, ADR-0011, see the `postinstall` script). A
     major Capacitor bump can break that patch and the native build. Treat the
     whole `@capacitor/*` family as a coordinated set, not independent bumps.
   - **`svelte` / `@sveltejs/*` / `vite` / `vite-plugin-*`** — these move
     together; a Svelte or SvelteKit major usually pins a Vite/plugin range.
     Don't bump one in isolation.
   - **`typescript`, `svelte-check`, `vitest`, `@playwright/test`, `happy-dom`**
     — toolchain; a major here can surface new type errors or test-runner API
     changes across the codebase.
   - Anything whose name implies it gates the build/native targets.

## Phase 2 — Plan & ask (gate)

4. **Propose an ordering.** Sequence the upgrades safest-first: standalone
   leaf libraries and dev tooling before framework cores; coordinated families
   (Capacitor, Svelte/Vite) handled as a single grouped step. Skip anything
   that's intentionally pinned for a documented reason.
5. **Surface decisions with `AskUserQuestion`** *before* doing any work —
   this is the one place to interrupt; after it you run autonomously. Good
   things to confirm:
   - Whether to include **major** version jumps or stick to minor/patch this run.
   - How to handle the **coordinated families** (e.g. attempt the Svelte 5.x →
     next-major or Capacitor major together, or defer them).
   - Any package the user wants to **hold back** or pin.
   - Whether to run the **full `npm test`** (unit + Playwright E2E) per package
     or just `npm run check` + unit tests, with full E2E once at the end
     (E2E is the slow part — default to check + unit per package, full suite
     before the last commit).
   Present a concise plan alongside the questions so the user can approve the
   whole sequence in one pass.

## Phase 3 — Execute, one package at a time (autonomous)

**Start from a clean tree.** Run `git status` first; if anything unrelated is
uncommitted (e.g. a lockfile the `postinstall` hook reconciled), commit or
revert it before touching dependencies, so no upgrade commit picks up stray
changes. Then work through the approved list **sequentially**. For each package:

6. **Read the migration guide.** Use `WebSearch` / `WebFetch` to find the
   release notes / changelog / upgrade guide for the target version (the
   project's outbound HTTPS goes through the agent proxy — see the environment
   notes). For a major jump, read every intermediate major's breaking-changes
   list, not just the latest. Summarize the breaking changes that could plausibly
   touch this repo.
7. **Bump the version.** Update the range in `package.json` and install
   (`npm install <pkg>@<version>`). Let `postinstall` (`patch-package`) run; if a
   patch fails to apply, stop and resolve it (regenerate the patch or hold the
   upgrade) — do not commit a broken patch.
8. **Audit every usage.** Grep the whole codebase (`web/src/`, `scripts/`,
   config files, `android/` & `ios/` only where they consume the JS package) for
   imports and API calls of the package. Confirm each call site is still valid
   against the new API; apply the codemod / manual edits the migration guide
   calls for. Don't assume a clean `npm install` means the code is correct.
9. **Verify.** Run `npm run check` (svelte-check / types) and the agreed test
   tier for this package. Type errors and test failures are part of the
   migration — fix them here, not in a later commit. If the upgrade can't be made
   green within reason, **revert that package** (restore `package.json` +
   `package-lock.json`, reinstall), note why, and move on — don't leave the tree
   broken.
10. **Commit just this upgrade.** Stage `package.json`, `package-lock.json`, any
    `patches/` change, and the source edits this upgrade required — nothing from
    other packages. Review the staged diff (`git diff --cached`) to confirm it's
    scoped to this one package before committing. Use a plain imperative subject
    matching the repo's style,
    e.g. `Upgrade vitest to 4.x` or `Bump @capacitor/* to 8.4`. Mention the
    notable breaking change handled in the body if it's non-obvious. Then move to
    the next package.

Keep each commit self-contained and green so any single upgrade can be reverted
or bisected on its own.

## Phase 4 — Wrap up

11. **Full verification.** After the last upgrade, run the complete `npm test`
    (unit + E2E) once to confirm the combined result is green, even if you ran
    lighter tiers per package.
12. **ADR check.** If any upgrade changed an architectural constraint or
    encoded a non-obvious decision (e.g. dropping a Capacitor plugin, a build
    target change, a new pinned floor), consider documenting it with
    **`/create-adr`**. If the Capacitor patch changed, update ADR-0011's notes.
13. **Report.** Summarize what was upgraded (and to what), what was deferred or
    reverted and why, and anything still outdated by design. List the commits
    you made.

## Shared audit conventions

This is an audit skill. It doesn't write to `docs/audit.md` (its findings land as one
commit per package), but the run-tracking conventions in
[`.claude/audit-conventions.md`](../audit-conventions.md) still apply:

- **Log the run** (§2) — add a row to `docs/audit-log.md` summarizing what was upgraded,
  deferred, or reverted.
- **Self-heal** (§3) — if a package surfaced a durable upgrade landmine (a patch that
  broke, a coordinated family, a codemod gotcha), fold it into this file's landmine list.
