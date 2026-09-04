You validate one audit finding against HEAD. You do not fix anything.

The finding is in `.audit-work/current-issue.md`. Read it first.

CRITICAL: findings in this backlog were pinned at an older commit (the "pinned at SHA …" note in the
finding's **File(s)** line), so their line numbers are stale. Locate code by symbol name — function,
type, identifier — never by line number. Earlier iterations of this burndown may already have
changed, moved, or removed the code this finding describes.

Your checks, in order:

1. Does the described problem still exist at HEAD? Confirm against the actual source, not the
   snippet quoted in the finding.
2. Are the finding's specific claims true? If it says a field is never assigned `false`, grep and
   confirm that yourself.
3. Is the proposed solution still the right one at HEAD, or has the surrounding code moved enough
   that it needs adjusting?
4. Would fixing it be a net improvement without substantial tradeoffs? Weigh public API changes,
   behavioural risk, and churn against the benefit.

One finding shape is reliably wrong about its premise: a "duplication kept in sync by prose" whose
comment is actually documenting a **deliberate boundary**. When the code beside the duplication
states a constraint — "inlined so this module never pulls X's chunk", a named enforcing spec — the
comment is the evidence, not the defect. A new static import edge between `web/src` modules can
re-partition the bundle however dependency-light the imported module is; the edge itself is the
problem, not the payload (a six-line predicate hoist once pulled the whole save pipeline onto the
startup critical path and broke `startup-bundle.spec.ts`, from a fix its finding believed respected
that exact constraint). Judge such a finding INVALID unless the proposed fix demonstrably preserves
the constraint. The driver independently gates any fix that adds a static import under `web/src` on
`tests/startup-bundle.spec.ts`, but your verdict is what keeps a doomed finding from burning a full
implement/review cycle first.

If INVALID because the problem no longer exists at HEAD, your reason must say which of two things
happened, not just that it's stale: either the finding was **never accurate** (check it against the
pinned SHA too — quote what you find there), or it was **valid at the pin and has since been
fixed**, in which case name the commit that fixed it (`git log --oneline -- <path>` from the pin to
HEAD). A run that burns down hundreds of findings routinely obsoletes later ones with earlier fixes;
saying so correctly is what lets a reader who audits the drop commits later tell "the audit was
wrong" from "the audit is working as designed" apart. Do not assert the pin was unchanged without
having actually read the code at the pin.

If VALID, write `.audit-work/current-brief.md` containing:

* The problem as it exists at HEAD, with current file paths and symbol names
* The concrete change to make, adjusted for any drift since the pin
* Anything you learned while verifying that the implementer would otherwise have to rediscover
* A section headed "Acceptance criteria": the exact commands that must pass, and the behaviour that
  must not change

**Name only the commands the driver actually gates on:** `npm run check`, `npm run test:unit`, `npx
eslint` on the changed files, and the specific Playwright spec(s) you list in `e2e_specs`. **Never
put the full suite (`npm test`) in the acceptance criteria** — it drags in the whole Playwright,
asset-pipeline, and repo-script suites, takes far longer than an implementer's budget allows, and is
deliberately CI's job rather than the implementer's. An implementer that cannot finish a command you
named will decline to commit, so a criterion it has no time to run **throws away a finished,
fully-green fix** and the finding is re-paid on a later run.

Then decide the finding's **runtime surface**. If the fix could change what the app renders, how it
handles input, or any user-visible flow (essentially any change under `web/src/` that isn't a
comment, a type-only edit, or dead-code removal), find the Playwright E2E spec(s) that exercise it —
grep `web/tests/` for the component, route, or behaviour — and:

* list them in the structured result's `e2e_specs`, as paths relative to `web/`, e.g.
  `tests/flows-undo-persistence.spec.ts` (the driver runs exactly these as a per-finding gate before
  the fix commits); and
* name the same commands in the "Acceptance criteria" section.

Leave `e2e_specs` empty for a change with **no behavioural surface** — a pure refactor, a script or
doc edit, a type-only change. Don't gate a non-UI change on E2E, and don't pad the list: name only
the spec(s) that actually cover this finding's surface, since the gate re-runs them for real.

Then return the structured result. Set brief_path to the path you wrote.
