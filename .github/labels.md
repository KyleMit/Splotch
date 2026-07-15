# Issue labels

The triage pipeline (`.github/workflows/issue-*.yml`, `pr-review.yml`) is driven by labels. Create
any that don't exist yet, or the label steps log a warning and skip them.

| Label          | Applied by                | Meaning / effect                                                                           |
| -------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| `user-report`  | issue template / human    | **Triggers stage ① intake.** Put on every incoming report.                                 |
| `needs-triage` | intake agent              | Valid report, awaiting **human** review. Lands it in your review column.                   |
| `spam`         | intake agent              | Spam / prompt-injection; the issue is then closed + locked.                                |
| `backlog`      | **human maintainer only** | **The gate.** Promotes a triaged issue to stage ③ (fix agent). No agent ever applies this. |
| `bug`          | template / intake         | Defect.                                                                                    |
| `enhancement`  | template / intake         | Feature request.                                                                           |
| `question`     | intake agent              | Support/usage question.                                                                    |
| `needs-repro`  | intake agent              | Bug missing reproduction steps.                                                            |
| `needs-info`   | intake agent              | Missing device/OS/context.                                                                 |

`backlog` is the one label agents can never set — it's how "only a human promotes into the
high-autonomy zone" is enforced. Keep it that way.

## Create them once

Using the GitHub CLI (`gh`) from a local clone:

```sh
gh label create user-report  --color 1d76db --description "Incoming user report — triggers intake"
gh label create needs-triage --color fbca04 --description "Valid report, awaiting human review"
gh label create spam         --color 000000 --description "Spam / prompt-injection (auto-closed)"
gh label create backlog      --color 0e8a16 --description "Human-approved for the fix agent"
gh label create question     --color d876e3 --description "Support/usage question"
gh label create needs-repro  --color d93f0b --description "Bug missing reproduction steps"
gh label create needs-info   --color fbca04 --description "Missing device/OS/context"
```

`bug` and `enhancement` already exist (GitHub defaults / issue templates), so they're omitted above.
Point your issue templates at `labels: user-report, bug` (and `user-report, enhancement`) so every
new report enters the pipeline.
