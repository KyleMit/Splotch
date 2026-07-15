# Agentic issue pipeline — flow, actors, and the human gate

How a user report travels from filed to reviewed-fix-PR across four stages, and the one place a
human must act. Security rationale is in [`README.md`](./README.md); labels in
[`../labels.md`](../labels.md).

## Flow

```mermaid
flowchart TD
    A([Issue filed with user-report label]) --> B[["① Intake agent · read-only"]]
    B --> C{spam or prompt-injection?}
    C -- yes --> D([Close + lock · pipeline ends])
    C -- no --> E[Comment findings + apply needs-triage] --> F[[needs-triage column]]

    F --> GATE{{"HUMAN GATE — maintainer only<br/>verify report, add backlog label"}}

    GATE --> H[["③ Fix agent · writes code<br/>branch claude/fix-N"]]
    H --> I{produced a fix?}
    I -- no --> J([Comment: needs a human · stays in backlog])
    I -- yes --> K([Draft PR: claude/fix-N → main · Fixes N])

    K --> L[["④ Review agent · adversarial"]]
    L --> M{found improvements?}
    M -- no --> N([Approving review note on the PR])
    M -- yes --> O([PR: claude/review-N → claude/fix-N])

    K --> P{{"Optional: ruleset requires<br/>human review before merge to main"}}

    classDef low fill:#cfe2f3,stroke:#3d85c6,color:#000;
    classDef high fill:#f9cb9c,stroke:#b45f06,color:#000;
    classDef gate fill:#f4a261,stroke:#c1121f,color:#000,stroke-width:2px;
    class B low;
    class H,L high;
    class GATE,P gate;
```

Blue = low-autonomy (comment / label / close-own-issue only). Orange = high-autonomy (writes code,
opens PRs). The gate is the wall between them — **autonomy escalates only across the `backlog`
label, which only a human can apply.**

## The human gate

There is exactly one required human action: **a maintainer adds the `backlog` label** to a
`needs-triage` issue they've verified. It's enforced, not just convention:

* No agent has `backlog` in any allowlist — nothing automated can promote an issue.
* The fix agent additionally refuses unless `sender.type == 'User'` **and** the promoter has
  `write`/`admin`/`maintain` on the repo.

Everything before the gate is reversible and non-destructive-to-code; everything after it writes
code but only ever lands as a **draft PR you review and merge**. (Dragging the card to a Backlog
column can be your visual habit — but on a personal-account Project the *label* is what the machine
watches. See the README's upgrade note.)

## Who does what, when, where

| Actor                                | Does what                                                                         | When                        | Where                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------- |
| **Reporter** / template              | Files an issue carrying `user-report`                                             | Trigger                     | GitHub                                                    |
| **Intake agent (Claude, read-only)** | Classifies, drafts comment, flags spam/dupes → writes `triage-verdict.json`       | On `user-report`            | `intake-prompt.md`                                        |
| **`apply-intake.sh`**                | Posts comment; closes+locks spam; else applies `needs-triage` (+ type labels)     | Right after analysis        | `apply-intake.sh` (sole mutator, targets `$ISSUE_NUMBER`) |
| **Maintainer — the gate**            | Verifies the report, adds `backlog`                                               | After intake                | GitHub issue UI (label)                                   |
| **Fix agent (Claude)**               | Branches `claude/fix-N`, implements a scoped fix, runs checks/tests, commits      | On human `backlog`          | `fix-prompt.md`                                           |
| **`open-fix-pr.sh`**                 | Pushes + opens a **draft** PR (or comments if no fix)                             | After the agent             | `open-fix-pr.sh`                                          |
| **Review agent (Claude)**            | Adversarially reviews the diff, commits concrete suggestions to `claude/review-N` | On `claude/fix-*` PR opened | `review-prompt.md`                                        |
| **`open-review-pr.sh`**              | Opens a PR into the fix branch (or leaves an approving note)                      | After the review            | `open-review-pr.sh`                                       |
| **Maintainer — merge**               | Merges suggestions into the fix, then the fix into `main`                         | End                         | GitHub PR UI                                              |

## Enable each stage independently

| Repo variable         | Turns on | Recommended rollout                                                   |
| --------------------- | -------- | --------------------------------------------------------------------- |
| `INTAKE_ENABLED=true` | Stage ①  | Start here — low risk.                                                |
| `FIX_ENABLED=true`    | Stage ③  | Enable once you trust intake and are ready for code-writing autonomy. |
| `REVIEW_ENABLED=true` | Stage ④  | Enable alongside or after ③.                                          |

Set at **Settings → Secrets and variables → Actions → Variables**.
