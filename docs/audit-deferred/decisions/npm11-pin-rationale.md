# The npm@11 pin rationale is copy-pasted across four shell files

**Original finding:** [P2][duplication] — `.claude/hooks/session-start.sh`,
`.claude/cloud/setup.sh`, `.codex/cloud/setup.sh`, `.codex/cloud/maintenance.sh` — deferred because
the burndown sandbox denied writes to `.codex/cloud/*.sh`, leaving the four-file change incomplete.
**Verdict:** FIX

## Context

The decision "pin npm to 11 because `package-lock.json` is authored by npm 11 and a mismatched npm
rewrites/rejects the lockfile" is re-explained at paragraph length in four shell files, and the
command `npx -y npm@11 install -g npm@11` appears in three of them. The finding proposed collapsing
the rationale to one canonical doc home and leaving a one-line comment plus doc pointer in each
script (the command itself must stay inline — the cloud scripts are pasted into web UIs and must be
standalone).

There were **no substantive reviewer objections**. The burndown attempt updated the two `.claude/`
files, then the sandbox denied writes to `.codex/cloud/setup.sh` and `.codex/cloud/maintenance.sh`;
with the four-file change incomplete, the implementer correctly declined to commit. The approach was
never contested — only the environment failed.

## Current state (verified at HEAD 63a7aa49)

All four copies are still present, at slightly shifted lines:

* `.claude/hooks/session-start.sh:15-20` — six comment lines re-deriving the cross-major
  lockfile-dialect story to justify the hook's discard-lockfile-churn fallback (the hook itself does
  not run the pin).
* `.claude/cloud/setup.sh:27-34` — eight comment lines: image ships npm 10, majors disagree on
  optional-peer entries, hook fallback, why `npx`.
* `.codex/cloud/setup.sh:37-42` — six comment lines: image ships npm 11.4.2, the picomatch `npm ci`
  failure, mirrors `.claude/cloud/setup.sh`, why `npx`.
* `.codex/cloud/maintenance.sh:29-31` — three lines that say "see setup.sh for the full rationale"
  and then restate most of it anyway.

Both canonical doc homes **already exist and are complete**:

* `docs/CLOUD/Claude.md:134-139` — the "**npm-version note**" paragraph: full Claude-side rationale
  (npm 10 image, dialect churn, the two protective layers).
* `docs/CLOUD/Codex.md:36-45` — full Codex-side rationale (npm 11.4.2 image, the
  `Missing: picomatch@… from lock file` failure, why latest 11.x fixes it), plus line 81 noting both
  environments share the pin.

So the fix is purely subtractive: no doc content needs to be written, only script comments trimmed
to pointers.

**Provenance (all four are direct-edit):** none of the four files carries a `<!-- Source: ... -->`
marker; `CLAUDE.md` lists `.claude/hooks/` and `.claude/cloud/` as not-generated, and
`.codex/cloud/*.sh` are the version-controlled sources that are *manually synced into the Codex
Cloud UI* (`docs/CLOUD/Codex.md:5`) — nothing generates them. No `.ruler/` detour applies.

**Is the pin still needed? Yes.** `package-lock.json` is `lockfileVersion: 3` authored by npm 11.x
(local dev currently runs 11.18); `package.json` `engines` pins only `node >=22.13`, and Node 22
images still ship npm 10.x. No npm mechanism self-corrects the npm version (`engines.npm` only
errors under engine-strict; corepack does not manage npm itself), so the pin — and its rationale —
remain live. Deleting the pin is not the better fix.

**One correction to the finding's framing:** the "drift" is only partly drift. The Claude and Codex
prose differ because the *facts* differ — Claude's image ships npm 10 (cross-major dialect churn
that dirties the tree), Codex's ships npm 11.4.2 (same-major patch disagreement that fails
`npm ci`). These are two genuinely different failure modes and each is correctly documented in its
own environment doc. The dedup must therefore point each script at **its own** doc, not merge the
two stories into one paragraph.

## Options considered

1. **Trim each script comment to 1–3 lines with a pointer to its environment doc** (the finding's
   own proposal) — winner. Subtractive, zero behavior change, docs already complete.
2. **Factor the command into a shared sourced snippet** — rejected in the finding itself and still
   invalid: `.codex/cloud/*.sh` are pasted standalone into the Codex UI and cannot source repo files
   reliably at environment-creation time; `.claude/cloud/setup.sh` runs before deps exist.
3. **Delete the pin as obsolete** — rejected; verified above that the mismatch between image npm and
   lockfile-authoring npm is still real on both platforms.

## Decision / lean

**FIX.** Replace the long comment blocks with the following (exact text; wording may be lightly
adjusted at implementation time but keep the doc pointer and the `npx` justification):

`.claude/cloud/setup.sh` (replace lines 27-34):

```bash
# Pin npm to the major that authors package-lock.json — a mismatched npm rewrites
# lockfile metadata in its own dialect and dirties the tree every session; full
# rationale in docs/CLOUD/Claude.md ("npm-version note"). Via npx so the installer
# isn't the npm being replaced (an in-place self-update can die halfway).
```

`.claude/hooks/session-start.sh` (replace lines 15-20; this comment justifies the hook's
discard-churn fallback, so it keeps that framing):

```bash
# .claude/cloud/setup.sh pins npm@11 to match package-lock.json's authoring major.
# If the pin is ever missing, a different npm rewrites lockfile metadata in its own
# dialect (docs/CLOUD/Claude.md, "npm-version note") — discard that churn, but
# never touch a lockfile that already had edits.
```

`.codex/cloud/setup.sh` (replace lines 37-42):

```bash
# Pin npm@11 (latest 11.x) to match the npm that authors package-lock.json — the
# image's older 11.x otherwise fails `npm ci` on optional-peer lockfile entries;
# full rationale in docs/CLOUD/Codex.md. Via npx so the installer isn't the npm
# being replaced (an in-place self-update can die halfway).
```

`.codex/cloud/maintenance.sh` (replace lines 29-31):

```bash
# Pin npm@11 to match package-lock.json's authoring npm — see docs/CLOUD/Codex.md.
```

No doc edits required. The `warn` fallback messages and the commands stay exactly as they are.

Notes for the implementer:

* `scripts/tests/claude-cloud-setup.test.mjs` stubs on the literal command string
  `npm@11 install -g npm@11`, not on comments — unaffected, but run `npm test` (or at least the
  repo-script tier) as the gate anyway.
* `.codex/cloud/*.sh` are manually synced into the Codex UI. This change is comment-only (identical
  behavior), so no urgent resync is needed; note in the PR that the UI copies will pick up the new
  comments on the next routine sync.
* Verification: `grep -rn "optional-peer" .claude .codex` should return only
  `.codex/cloud/setup.sh`'s one-liner (the term is load-bearing there) or nothing, and the
  multi-line explanations should exist only in `docs/CLOUD/Claude.md` and `docs/CLOUD/Codex.md`.

## Why the previous attempt failed, and how this path avoids it

The only failure was environmental: the burndown sandbox's write policy denied edits to
`.codex/cloud/setup.sh` and `.codex/cloud/maintenance.sh`, so the four-file change could not be
completed atomically. No reviewer objection stands against the approach itself. Implementing in a
normal session (or any environment whose permissions cover `.codex/`) resolves it; there is nothing
to re-litigate.
