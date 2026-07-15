# Automated issue triage — security model

Files here power `.github/workflows/issue-triage.yml`, which does a first-pass triage of every newly
opened issue using Claude (on the repo owner's Claude subscription via `CLAUDE_CODE_OAUTH_TOKEN`).

This is a **public** repo, so issue text is attacker-controlled input fed to an LLM. The design
assumes the model can be prompt-injected and makes that harmless:

| Risk                                              | Guard                                                                                                                                                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secret exfiltration / arbitrary command execution | Claude runs **read-only**: `--allowedTools "Read,Write,Glob,Grep"`, `--disallowedTools "Bash,Edit,WebFetch,WebSearch"`. No shell, no network — nothing to exfiltrate *with*.                                                          |
| Privilege escalation (push code, open PRs)        | Workflow `permissions:` is `issues:write` + `contents:read` only. A fully-hijacked agent still can't push or touch other repos.                                                                                                       |
| Weaponized labels/comments                        | Claude never calls GitHub. It only **writes `triage-verdict.json`**; the deterministic `apply-triage.sh` is the sole mutator. It targets the issue number from the event payload (not the model) and applies only allowlisted labels. |
| Weaponized closing                                | Closing lives in a separate `enforce` job that runs only in `autonomous` mode and is gated behind the `triage-actions` environment's required-reviewer approval.                                                                      |
| Instruction/data confusion                        | `triage-prompt.md` marks issue text as untrusted data, never instructions.                                                                                                                                                            |
| Quota/compute abuse                               | `--max-turns`, job `timeout-minutes`, `concurrency`, and the `TRIAGE_ENABLED` kill switch.                                                                                                                                            |
| Expression injection (crafted title/body)         | Untrusted fields are passed via `env:` + `jq --arg`, never interpolated inline into a `run:` script.                                                                                                                                  |

## Graduated autonomy (`TRIAGE_MODE` repo variable)

* `observe` (default) — comment only, applies nothing.
* `assist` — comment + apply allowlisted labels, never closes.
* `autonomous` — also runs the gated `enforce` job (close duplicates/spam after human approval).

## Files

* `triage-prompt.md` — the analysis instructions and verdict schema Claude follows.
* `apply-triage.sh` — deterministic comment + label enforcement (observe/assist).
* `enforce-triage.sh` — deterministic gated close (autonomous only).

See `../labels.md` for the label allowlist and one-time creation commands, and the header of
`../workflows/issue-triage.yml` for the full setup checklist.
