---
name: reconcile-docs-with-code
description: Bring the living docs, skills, and rules back in line with the code — review the identifiers `npm run check:doc-refs -- --identifiers` cannot resolve, hunt the prose that still describes renamed or deleted files and symbols by name, re-justify every doc-reference exemption, and fix each mismatch. Use when asked to reconcile docs with code, find stale or dead references in docs, check that docs still match the code, or after a large rename, provider swap, or deletion lands. A dead repo path or npm script already fails CI through the same scanner; this skill covers the judgment the gate cannot make.
---

# Reconcile docs with code

`tools/check-doc-references.mjs` (`npm run check:doc-refs`, and
`tools/tests/doc-references.test.mjs` in the CI tools tier) already fails any PR that leaves a
living doc naming a **repo path or npm script** that does not resolve. So a run never starts from a
backlog of dead paths. It starts from the three kinds of drift the gate cannot see:

* **Identifiers** — a code span naming a function, constant, or type. The scanner lists the ones no
  tracked source file contains, but most are platform APIs, env vars, JSON fields, or another tool's
  names, so the list is advisory and only judgment can sort it.
* **Prose about a thing that changed** — a sentence that still says the app calls a provider it no
  longer calls, or that a list has five entries after one was deleted, with no path in it to break.
* **Exemptions** — each entry in `ALLOWED_REFERENCES` is a claim that a reference is deliberately
  unresolvable. The gate fails when an entry stops matching, but not when the reason goes stale.

Scope is the scanner's: `*.md` and `*.md.template` outside history. Leave these alone even when they
name something dead — rewriting them would falsify a record: `docs/adrs/`, `docs/scratchpad/`,
`docs/handoff/`, `docs/investigations/`, `docs/audit-deferred/`, `docs/AUDIT*.md`, `scrapbook/`,
`perf-profiles/`, `releases/`, `tools/asset-gen/{docs,ideas-exploration,legacy}/`, skill notes, and
`NOTES.md` design logs. Fix a generated `CLAUDE.md`/`AGENTS.md` or skill copy through its `.ruler/`
source, then run `npm run ruler:apply`.

## 1. Set the window

Work on a fresh branch from the latest `origin/main`. Find the previous run so the hunt covers only
what changed since:

```bash
git log --format='%H %cs %s' --grep='reconcile-docs-with-code' -1 origin/main
```

Use that commit as `<base>`; with none, use the commit from 30 days back
(`git rev-list -1 --before='30 days ago' origin/main`).

## 2. Confirm the gate is green

```bash
npm run check:doc-refs
```

It should pass on `main`. If it fails, fix those findings first, the same way step 4 does: update
the reference to what it now names, or delete it when the thing is gone for good.

## 3. Sort the advisory identifiers

```bash
npm run --silent check:doc-refs -- --identifiers
```

Decide each listed identifier by reading the sentence around it, not by the name:

* **External — leave it.** Android and iOS platform constants (`SCREEN_ORIENTATION_*`,
  `LANDSCAPE_LEFT`), browser and CDP names (`getBBox`, `Target.targetInfoChanged`), env vars
  (`NODE_PATH`, `BASH_DEFAULT_TIMEOUT_MS`), agent tool names (`AskUserQuestion`, `EnterWorktree`),
  third-party API fields (`closingIssuesReferences`, `modelUsage`), library calls (`vi.setConfig`),
  and fields that live only in captured evidence JSON, which the source index does not read.
* **Illustrative — leave it.** Examples of a shape (`getErrorMessage`, `initX()`), and names cited
  as the thing *not* to build (`waitForStable`).
* **Stale repo symbol — fix it.** The sentence describes this repo's code, and the name is gone.
  Find what replaced it (`git log -S '<name>' --oneline -- web/src tools` shows the commit that
  removed it; read that diff), and rewrite the reference to the current name. If the concept is
  gone, rewrite or delete the sentence.

## 4. Hunt prose about renamed and deleted things

List what disappeared in the window, then search the living docs for the old names:

```bash
git diff --name-status --diff-filter=DR <base> origin/main -- web/src tools android ios netlify
```

For each deleted or renamed source file, search for its basename without extension (`geminiSafety` —
the gate already covers the full path), and for the main exported symbols it had:

```bash
git grep -n -w '<stem-or-symbol>' -- '*.md' '*.md.template' ':!docs/adrs' ':!docs/scratchpad'
```

Read each hit in context. What drifts, and what the fix looks like:

* **A count or list that included the deleted thing** — "the five modules", a table row. Fix the
  count and remove the row.
* **A claim about behavior the change moved** — "the `@google/genai` SDK is only touched inside
  `lib/server/ai/`" after the server moved to OpenAI. Rewrite it to say what is true now, naming
  where the thing went.
* **A bare stem or symbol in prose** — rename it in step with the code.

A large provider swap, rename, or deletion leaves drift across several docs at once. When the window
contains one, search for the *concept* as well as the file (the vendor name, the old feature name).

## 5. Re-justify every exemption

Read `ALLOWED_REFERENCES` in `tools/check-doc-references.mjs`. For each entry, open the doc and ask
whether the `why` is still true. A reference allowlisted because "the setup steps tell the reader to
create it" is stale once the file exists; the scanner then flags the entry as matching nothing, and
the entry comes out. Delete any entry whose reason no longer holds and fix the reference instead.

Add an entry only for one deliberately unresolvable reference: a counter-example, a file the
procedure tells the reader to create, a record of something removed. When several references share
one shape, teach the scanner the rule instead (step 6).

## 6. Teach the scanner a new false-positive class

If step 2 or 3 turns up a new kind of noise — a shape of code span that is never a repo path, or a
new history folder — change the rule in `tools/check-doc-references.mjs`, add a case to
`tools/tests/doc-references.test.mjs`, and record the class in the skill notes. Do not widen a rule
until real hits disappear: every relaxation should come with a test showing a real stale reference
is still caught.

## 7. Verify and ship

```bash
npm run check:doc-refs
npm run test:tools -- doc-references
npm run format:check
```

The scanner resolves against `git ls-files`, so a file you just created reads as missing until you
`git add` it.

Run `npm run ruler:apply` after any `.ruler/` edit. Ship one PR whose commit subject or body names
`reconcile-docs-with-code`, so the next run finds its window in step 1. The PR body lists each fixed
reference with what it now says, each identifier judged stale, and each exemption added or removed
with its reason.
