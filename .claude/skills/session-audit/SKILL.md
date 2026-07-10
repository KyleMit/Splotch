---
name: session-audit
description: Retrospective on the current session that files durable, recurring friction (finding, understanding, running, or changing code) as audit findings in docs/AUDIT.md so the repo's Claude tooling gets sharper over time. Use near the end of a working session, before /clear, or when asked to reflect on session friction.
---

# Session Audit

Reflect on the session I just had — the friction I hit finding, understanding, running, or changing code — and file the durable, recurring problems as audit findings, so the repo's Claude tooling (skills, rules, CLAUDE.md, ADRs) gets sharper over time.

This is a **retrospective on one session**, not a sweep of the codebase. Run it near the end of a working session, before `/clear`. Its whole value is aggregation across many runs, so honesty per run matters more than volume.

## How to audit

Work from evidence, not vibes. Your in-the-moment sense of "what felt slow" misses the friction that never registered — go back through THIS session's actual history and look for the observable tells:

- **Repeated tool calls at the same target** — the same file Read more than once, a Grep re-run with tweaked patterns, a Bash command retried several ways. Each repeat means something wasn't where you expected it.
- **Failed commands followed by a correction** — a script that errored, a wrong path, a guessed flag. Ask why the *first* attempt failed and what would have told you the right form up front.
- **Guesses that turned out wrong** — a file you expected to hold X but didn't, a naming convention you had to discover, a doc you went looking for and it wasn't there.
- **Detours** — loading a skill/doc late that you should have read first, or re-deriving a fact already written down somewhere in the repo.

Weight the **whole** session, not just the last few turns — early friction is exactly what a long session compacts away.

### The bar for filing

Only file friction that will **recur** — where the next session, or another contributor, would hit the same wall. A one-time confusion, a mistake you made and immediately saw, or a problem an existing skill/rule already covers is **not** a finding. Be strict:

- **An empty audit is a valid, honest result.** Do not invent findings to fill the file. Noise poisons the cross-session aggregate more than a blank run does.
- Every finding's fix must be a **concrete, durable change to the repo's Claude tooling** — a new/edited skill, a path-scoped rule in `.claude/rules/`, a CLAUDE.md note, a script, a clearer error message, or an ADR. "Try harder / remember next time" is not a fix; if there's no artifact to change, it's not a finding.
- Before filing, check whether the gap is *already* covered — grep the skills/rules/CLAUDE.md for the topic. Friction caused by not reading an existing doc is a signal about discoverability at most, not a new doc to write.

## Output

If nothing clears the bar, write nothing to `docs/AUDIT.md`. Just log the clean run (see conventions below) and say so.

Otherwise, **merge** findings into `docs/AUDIT.md` under a `## Source: Session audit` section, using the canonical finding format. Map each friction point onto it:

- `### [Category] Short, action-oriented title` — Category is one of:
  - `[Traversal]` — finding or navigating code (wrong file, unclear naming, missing source map entry)
  - `[Execution]` — running, building, testing (failed/ambiguous command, missing script, unclear error)
  - `[Docs]` — a doc that was missing, wrong, stale, or undiscoverable
  - `[Tooling]` — a skill / rule / script / ADR gap
- `#### Problem` — what you were trying to do and the concrete friction, **with the evidence from session history**: the re-runs, the failed command, the wrong guess. Cite the actual files, commands, and paths. Add a one-word cost tag — `blocked` / `slow` / `minor` — so the aggregate is sortable.
- `#### Proposed solution` — the specific tooling change and exactly where it lives (which skill, which rule file, which CLAUDE.md, or a new ADR), plus one line on what it should contain. A starting point for the fix agent, not a mandate.
- `#### Verification` — how a future run confirms the fix landed (e.g. "the path is in the `architecture` skill's source map, so the next session finds it without a Grep sweep").

Order findings by recurrence × cost. Lead with the single highest-leverage one: if you could change one thing to make sessions faster, it goes first.

After writing, print a 1–2 sentence summary — what the session was about and the top finding, or "clean run — nothing to file."

## Method notes

Learned from prior runs:

- (seed) The friction worth filing is usually the friction you *didn't* notice while it was happening — trust the tool-call record over memory.
- (seed) Section 3 of the old reflection prompt over-proposed new skills for one-off problems. The recurrence bar above exists to kill that; hold the line.
- A clean run *is* the skill working — resist filing a sub-bar item just to prove it produced something. Litmus test that has held up: if none of the four tells (re-read, failed command, wrong guess, late detour) fired, a single quick lookup is not a finding, however real the underlying doc-gap. Report clean and note the candidate you passed on, so the judgment is visible without being filed.
- Discoverability ≠ non-finding when the answer is **siloed under the wrong trigger**. The seed rule ("friction from not reading an existing doc is discoverability at most") assumes the doc was reachable from where you looked. When a *failed-command chain* fires and the fix already exists but only under a differently-framed skill/runbook (e.g. the Chromium-screenshot fallback lives in `run-splotch` = "run the app", the Artifact-publish path lives in `night-twins.md` = "dark mode", but the task was "view an asset-gen review sheet"), that IS fileable — as a **cross-reference from the entry point you actually used**, not a new doc. Tell it apart from a genuine one-off by checking `docs/AUDIT-LOG.md`: if the same class of friction was "fixed" in a prior run and resurfaced, the fix landed where the next person won't look.
- A **self-inflicted, immediately-corrected** failed tool-call (a guessed flag, a nonexistent param) is not itself a finding — but don't stop at "my mistake." Ask *what made the wrong reach tempting*: often a nearby artifact has a durable gap that provoked it. This session's `Artifact({title})` error was self-inflicted, yet the real finding was that `gen-contact-sheet.mjs` emits no `<title>`, so the doc-prescribed publish step had nothing to name the sheet by. The tell that separates gap-from-one-off: a **sibling that already has the convention** (`gen-coloring-sheet.mjs` sets `<title>`) — a divergence to close, not a novelty to invent. When the user themselves flags the friction ("artifacts failed to publish multiple times"), weight it up: their perceived recurrence outranks a single visible occurrence in this transcript.
- A **doc-prescribed command that hits an external hard limit** is recurrence-guaranteed even if this session's retry was cheap: the prescription itself is what fails, so every future follower hits the same wall (e.g. the CLAUDE.md-prescribed `contact-sheet -- all --source shipped` publish at 28.8 MB vs the Artifact tool's 16 MB cap). Weight it by "who follows this doc next," not by the minutes lost this run.
- **Verification steps inside skills are themselves audit surface.** When a skill's own check produces a false positive in this environment, the finding is against the check, not the env — a future run trusting it fails *silently*, which outranks the visible frictions. Tell: you had to re-run the doc-prescribed check in a different form to get the true answer (e.g. pr-screenshots' `curl -sI` shows the cloud proxy's `200 Connection Established` for any URL, existing or not — the origin status needs `-w "%{http_code}"`). Silent-corruption cousins (a library call that "succeeds" but drops data, like sharp `joinChannel`→webp flattening alpha) get the same weighting: file where the next writer will look before reaching for the idiom.

## Shared audit conventions

This is an audit skill. Follow the shared conventions in
[`.claude/audit-conventions.md`](../../audit-conventions.md):

- **Merge into `docs/AUDIT.md`, don't overwrite** (§1) — the finding format and the file
  header live there; enrich existing items, add new ones, drop items whose fix has landed.
- **Log the run** (§2) — add a row to `docs/AUDIT-LOG.md`, one line summarizing what you
  filed (or "clean run").
- **Self-heal** (§3) — if this run surfaced a durable method learning (a session-history
  tell worth watching for, a false-positive trap), fold it into the Method notes above.
