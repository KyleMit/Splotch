# Doc-reference exemption review

All sixteen pre-existing entries were checked against their actual sentence and rationale. One new
exact reference is exempted for the historical-tag generator. No wildcard or scanner rule was added.
The create-handoff example claimed to be a worked example despite being absent; its prose and
rationale now identify an illustrative filename, without claiming a nonexistent specimen.

| Document                                            | Exact reference                         | Revalidated rationale                                                                                |
| --------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| tools/release/README.md                             | web/coloringPackManifest.ts             | the historical-tag reconstruction tool reads the selected tag's retired layout, not the current tree |
| tools/.ruler/AGENTS.md                              | tools/android/android-setup.mjs         | the naming rule cites it as the layout not to use                                                    |
| .ruler/knowledge-map.md                             | .claude/commands                        | the rule tells agents not to create workflows there                                                  |
| docs/ISSUE-WORKFLOW.md                              | docs/BACKLOG.md                         | names the retired backlog file the tracker replaced                                                  |
| tools/asset-gen/.ruler/AGENTS.md                    | docs/IDEAS.md                           | names the retired backlog file the frozen exploration burned down                                    |
| docs/MOBILE/compliance.md                           | assets/static/coloring/COLORING-BOOK.md | the compliance ledger records a file that shipped and was removed                                    |
| .ruler/skills/skills-guide/SKILL.md                 | .ruler/skill-forks                      | the fork mechanism is documented while no skill currently uses it                                    |
| .ruler/skills/audit-compatibility/SKILL.md          | src/zz-probe.test.ts                    | a throwaway file the procedure tells the agent to create and delete                                  |
| .ruler/skills/create-handoff/SKILL.md               | docs/handoff/coloring-fill-drift.md     | an illustrative packet filename the file-mode procedure creates                                      |
| .claude/skills/analyze-session-transcripts/SKILL.md | docs/scratchpad/session-reports         | the output folder the skill creates on its first run                                                 |
| .agents/skills/analyze-session-transcripts/SKILL.md | docs/scratchpad/session-reports         | the output folder the skill creates on its first run                                                 |
| .claude/skills/burn-down-audits/SKILL.md            | docs/AUDIT-PENDING-COMMENTS.jsonl       | the committed comment store a long run is told to create                                             |
| .agents/skills/burn-down-audits/SKILL.md            | docs/handoff/audit-burndown-run.md      | the handoff packet the skill writes when a run pauses                                                |
| tools/asset-gen/README.md                           | ./design/tokens.ts                      | an import specifier quoted relative to src/lib/theme.ts                                              |
| tools/asset-gen/README.md                           | ../fonts.ts                             | an import specifier quoted relative to src/lib/design/tokens.ts                                      |
| tools/vectorize/pilot/README.md                     | creatures/fairy-wide.outline.webp       | a key in the untracked pilot source catalog                                                          |
| tools/vectorize/pilot/README.md                     | creatures/fairy-wide.chalk.webp         | a key in the untracked pilot source catalog                                                          |
