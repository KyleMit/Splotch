# Audit

> Findings from Splotch's audit skills (`.claude/audit-conventions.md`).
> Clear the whole list autonomously with `/fix-audits`; validate it with `/vet-audits`.
> Skills **merge** into this file — they never overwrite each other's sections.

## Source: Session audit

### [Execution] Fresh-cloud `npm install` fails on `@capacitor/assets`' old sharp, silently killing the SessionStart dep install

**File(s):** `.claude/hooks/session-start.sh` (the `npm install` under `set -euo pipefail`), `docs/CLOUD.md` ("`npm install` + `npm run dev` work as usual"; "Getting dependencies ready"), `package.json` (`@capacitor/assets` devDep)

#### Problem

`slow` (arguably `blocked` — the session starts with no deps at all and nothing says so).

On a fresh cloud container, `npm install` fails: `@capacitor/assets` transitively pins
**sharp 0.32.6**, whose postinstall downloads
`libvips-8.14.5-linux-x64.tar.br` from `github.com/lovell/sharp-libvips/releases`, and
the session's agent proxy rejects it (`403 Forbidden`, "Via proxy … no credentials").
The root `sharp ^0.35.2` is unaffected — 0.33+ ships binaries as `@img/*` npm packages,
and `registry.npmjs.org` bypasses the proxy.

Observed in this session (2026-07-10):

- Session started with an **empty `node_modules`** (`ls node_modules | wc -l` → 0)
  even though `session-start.sh` runs `npm install` on every cloud SessionStart —
  the hook had already died on this exact error under `set -euo pipefail`, silently,
  so `npx svelte-kit sync` never ran either.
- Manual `npm install` reproduced it: `sharp: Installation error: Status 403 Forbidden`.
- Diagnosis cost a detour: grep `docs/CLOUD.md` (which instead claims installs
  "work as usual"), proxy status check, then a script over `package-lock.json` to find
  the dependent (`node_modules/@capacitor/assets` → `sharp 0.32.6`).
- Workaround that unblocked everything: `npm install --ignore-scripts && npx patch-package`
  (patch-package is the repo's only required lifecycle script; sharp 0.35 needs no
  install script). All asset-gen tooling then worked, including root sharp
  (`vips 8.18.3`).

Every future fresh cloud container hits this wall until the underlying install is fixed,
and the SessionStart hook guarantees the failure is invisible — the session just starts
without deps, and the first `npm run`/`npx` command fails confusingly later.

#### Proposed solution

Fix the install itself, then align hook + doc:

1. Preferred: stop needing the GitHub download. Either add an `overrides` entry in the
   root `package.json` lifting `@capacitor/assets`' `sharp` to `^0.35.2` (verify
   `npx capacitor-assets` still runs — its sharp usage is basic resize/composite), or
   upgrade/replace `@capacitor/assets` if a newer release already uses sharp ≥ 0.33.
2. Harden `.claude/hooks/session-start.sh` regardless: `npm install --ignore-scripts && npx patch-package`
   reproduces the full working tree without running any network-fetching postinstall,
   and a failure should print a loud one-liner rather than dying silently mid-hook.
3. Correct `docs/CLOUD.md`: the "work as usual" line and the "Getting dependencies
   ready" section should name this failure mode and the `--ignore-scripts` +
   `patch-package` recovery.

#### Verification

On a fresh cloud container (or after `rm -rf node_modules`): `npm install` exits 0 under
the agent proxy, `node -e "import('sharp')"` resolves, and a new session's
`session-start.sh` leaves `node_modules` populated so `npm run check` works with no
manual install step.
