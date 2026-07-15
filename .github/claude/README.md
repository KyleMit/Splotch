# Agentic issue pipeline — security model

These files power a four-stage pipeline that carries a user report from "just filed" to "reviewed
fix PR," with **one hard human gate** in the middle. Everything runs on the repo owner's Claude
subscription (`CLAUDE_CODE_OAUTH_TOKEN`) at $0 metered API cost. See `WORKFLOW.md` for the flow
diagram and a who-does-what table; `../labels.md` for the labels.

## The stages

| # | Workflow           | Trigger                              | Autonomy                            | What it does                                                                 |
| - | ------------------ | ------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------- |
| ① | `issue-intake.yml` | issue labeled `user-report`          | **low** (read-only + deterministic) | Comments findings; closes+locks spam/injection; else applies `needs-triage`. |
| — | *human gate*       | maintainer adds `backlog`            | —                                   | Verifies the report and promotes it. Only a human can.                       |
| ③ | `issue-fix.yml`    | issue labeled `backlog` (by a human) | **high** (writes code)              | Branches, implements a fix, opens a draft PR.                                |
| ④ | `pr-review.yml`    | PR opened from `claude/fix-*`        | **high** (writes code)              | Adversarially reviews; opens a suggestions PR against the fix branch.        |

## The gate — the whole security story in one line

**Autonomy escalates only across the `backlog` label, and only a human can apply it.** Stages ①
before the gate can't touch code; stages ③–④ after it can. The gate holds because:

* No agent has `backlog` in any allowlist — nothing automated can promote an issue.
* Stage ③ additionally checks `github.event.sender.type == 'User'` **and** that the promoter has
  `write`/`admin`/`maintain` permission on the repo.

## Injection hardening (public repo — issue text is attacker-controlled)

* **Stage ① runs read-only.** `--allowedTools "Read,Write,Glob,Grep"`,
  `--disallowedTools
  "Bash,Edit,WebFetch,WebSearch"` — no shell, no network. Its only output is
  `triage-verdict.json`; `apply-intake.sh` is the sole mutator, applies only allowlisted labels, and
  its one destructive action (close+lock) targets the reporting issue itself, so a hijacked
  verdict's blast radius is nil.
* **Untrusted fields** are passed via `env:` + `jq --arg`, never interpolated into a `run:` script.
* **Stages ③–④ do get Bash and write access** — but only after a human vetted the issue, and they
  operate on an isolated branch that lands as a **draft PR** a human still reviews and merges.
  Rulesets requiring review on `main` (free on public repos) are the recommended backstop.
* **Loop guards:** intake only fires on the `user-report` signal (not when it adds `needs-triage`);
  the review agent only fires on `claude/fix-*` PRs, so its own `claude/review-*` PR can't
  re-trigger it; fork PRs are skipped.

## Enabling / disabling (repo variables)

Each stage has its own kill switch, so you can light them up one at a time as you gain trust:

* `INTAKE_ENABLED=true` — stage ①
* `FIX_ENABLED=true` — stage ③ (leave off until you're ready for code-writing autonomy)
* `REVIEW_ENABLED=true` — stage ④

Set at **Settings → Secrets and variables → Actions → Variables**. Same place holds the
`CLAUDE_CODE_OAUTH_TOKEN` secret (from `claude setup-token`).

## Files

* `WORKFLOW.md` — flow diagram, the human gate, and a who-does-what-when-where table.
* `intake-prompt.md` / `apply-intake.sh` — stage ① analysis + deterministic enforcement.
* `fix-prompt.md` / `open-fix-pr.sh` — stage ③ fix instructions + deterministic push/PR.
* `review-prompt.md` / `open-review-pr.sh` — stage ④ review instructions + deterministic push/PR.

## Future upgrade: drag-to-column instead of a label

The `backlog` **label** is the stable gate contract. If you later move the repo + Project to a
GitHub **organization**, you can add a `projects_v2_item` webhook bridge that applies the `backlog`
label when a card is dragged to a Backlog column — the fix/review agents don't change, only the
promoter's identity check flips from "is a human" to "is the bridge app." Not available for
personal-account projects, so this pipeline uses the label directly.
