# Issue labels

The auto-triage workflow (`.github/workflows/issue-triage.yml`) applies labels only from this
allowlist. Create any that don't exist yet, or the `assist`/`autonomous` label step logs a warning
and skips them.

| Label                        | Meaning                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| `bug`                        | A defect (also set by the bug-report issue template)       |
| `enhancement`                | A feature request (also set by the feature template)       |
| `question`                   | A support/usage question, not a code change                |
| `needs-repro`                | A bug missing reproduction steps                           |
| `needs-info`                 | Missing device/OS/context the maintainer needs             |
| `triage/duplicate-suspected` | Triage thinks this restates an open issue (human confirms) |
| `triage/spam-suspected`      | Triage thinks this is spam/abuse (human confirms)          |
| `triage/reviewed`            | Auto-triage has done its first pass                        |

## Create them once

Using the GitHub CLI (`gh`) from a local clone:

```sh
gh label create question                   --color d876e3 --description "Support/usage question"
gh label create needs-repro                --color d93f0b --description "Bug missing reproduction steps"
gh label create needs-info                 --color fbca04 --description "Missing device/OS/context"
gh label create triage/duplicate-suspected --color cfd3d7 --description "Triage suspects a duplicate"
gh label create triage/spam-suspected      --color cfd3d7 --description "Triage suspects spam/abuse"
gh label create triage/reviewed            --color 0e8a16 --description "Auto-triage first pass done"
```

`bug` and `enhancement` already exist (GitHub defaults / issue templates), so they're omitted above.
