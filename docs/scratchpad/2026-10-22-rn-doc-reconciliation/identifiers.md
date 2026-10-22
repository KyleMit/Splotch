# Identifier advisory dispositions

Every advisory below was read in its surrounding sentence. No scanner matching rule or history
exclusion was widened. Stale live symbols fixed by this pass include INSTRUMENT_FILES_BY_COMMAND,
SOUND_URLS, parsePerfArgs, MAX_STARTUP_JS_CSS_BYTES, the Vite trustedOrigins option, boldText and
the obsolete RSD candidate/NativeDialog/toggleAi descriptions. Historical incidents in
CODING-STANDARDS remain explicitly labeled as historical rather than rewritten as RN coverage.

| Location                                                         | Advisory                     | Disposition                                                                                           |
| ---------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| .claude/audit-conventions.md:228                                 | AskUserQuestion              | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .claude/cloud/ANDROID-EMULATOR.md:51                             | assembleDebug                | Explicitly scoped historical platform measurement.                                                    |
| .claude/cloud/ANDROID-EMULATOR.md:68                             | SI_KERNEL                    | Explicitly scoped historical platform measurement.                                                    |
| .claude/cloud/ANDROID-EMULATOR.md:68                             | IMMEDIATE_CRASH              | Explicitly scoped historical platform measurement.                                                    |
| .claude/skills/analyze-session-transcripts/SKILL.md:65           | parentUuid                   | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .claude/skills/burn-down-audits/SKILL.md:72                      | CLAUDE_CODE_SESSION_ID       | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .claude/skills/burn-down-audits/SKILL.md:543                     | allowedSignersFile           | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .claude/skills/burn-down-audits/SKILL.md:568                     | hasTrustDialogAccepted       | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .claude/skills/burn-down-audits/SKILL.md:1010                    | modelUsage                   | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/conventions.md:11                                         | _MS                          | Illustrative name or naming pattern, not a shipped symbol.                                            |
| .ruler/conventions.md:11                                         | _PX                          | Illustrative name or naming pattern, not a shipped symbol.                                            |
| .ruler/conventions.md:74                                         | createX                      | Illustrative name or naming pattern, not a shipped symbol.                                            |
| .ruler/github.md:64                                              | closingIssuesReferences      | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/address-pr-review/SKILL.md:113                     | AskUserQuestion              | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/address-pr-review/SKILL.md:153                     | AskUserQuestion              | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/audit-dependency-health/SKILL.md:122               | AskUserQuestion              | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/audit-extractions/SKILL.md:26                      | getErrorMessage              | Illustrative name or naming pattern, not a shipped symbol.                                            |
| .ruler/skills/audit-extractions/SKILL.md:27                      | isValidDrop                  | Illustrative name or naming pattern, not a shipped symbol.                                            |
| .ruler/skills/audit-page-load/SKILL.md:52                        | evaluateModule               | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/audit-page-load/SKILL.md:109                       | ERR_CONNECTION_RESET         | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/audit-session/SKILL.md:139                         | NODE_PATH                    | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/burn-down-code-smells/references/unit-brief.md:143 | clearMocks                   | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/burn-down-code-smells/references/unit-brief.md:144 | unstubEnvs                   | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/burn-down-dependabot-prs/SKILL.md:325              | ERR_PNPM_BROKEN_LOCKFILE     | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/burn-down-outdated-dependencies/SKILL.md:60        | AskUserQuestion              | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/burn-down-oversized-code/SKILL.md:183              | createX                      | Illustrative name or naming pattern, not a shipped symbol.                                            |
| .ruler/skills/fix-audits/SKILL.md:59                             | AskUserQuestion              | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/improve-agent-workflow/SKILL.md:46                 | AskUserQuestion              | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/reconcile-docs-with-code/SKILL.md:58               | getBBox                      | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/reconcile-docs-with-code/SKILL.md:58               | targetInfoChanged            | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/reconcile-docs-with-code/SKILL.md:59               | NODE_PATH                    | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/reconcile-docs-with-code/SKILL.md:59               | BASH_DEFAULT_TIMEOUT_MS      | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/reconcile-docs-with-code/SKILL.md:59               | AskUserQuestion              | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/reconcile-docs-with-code/SKILL.md:59               | EnterWorktree                | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/reconcile-docs-with-code/SKILL.md:60               | closingIssuesReferences      | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/reconcile-docs-with-code/SKILL.md:60               | modelUsage                   | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/reconcile-docs-with-code/SKILL.md:62               | getErrorMessage              | Illustrative name or naming pattern, not a shipped symbol.                                            |
| .ruler/skills/reconcile-docs-with-code/SKILL.md:62               | initX                        | Illustrative name or naming pattern, not a shipped symbol.                                            |
| .ruler/skills/reconcile-docs-with-code/SKILL.md:63               | waitForStable                | Illustrative name or naming pattern, not a shipped symbol.                                            |
| .ruler/skills/resume-handoff/SKILL.md:20                         | AskUserQuestion              | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/ship-campaign/SKILL.md:151                         | resetsAt                     | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| .ruler/skills/ship-campaign/SKILL.md:245                         | closingIssuesReferences      | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| DEVELOPMENT.md:331                                               | requestLegacyExternalStorage | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| docs/CLOUD/Claude-Code.md:74                                     | BASH_DEFAULT_TIMEOUT_MS      | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| docs/CODING-STANDARDS.md:53                                      | DeepReadonly                 | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:77                                      | aiCredentialKind             | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:79                                      | orientationChoice            | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:83                                      | downloadedBookCount          | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:83                                      | downloadableBookCount        | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:144                                     | createImageReportFlow        | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:156                                     | savingUrl                    | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:182                                     | BrushType                    | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:183                                     | AiFailure                    | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:185                                     | inputName                    | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:187                                     | VerifyCredentialResult       | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:187                                     | finishAiGeneration           | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:198                                     | STROKE_FLAGS_BY_BRUSH        | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:221                                     | isAiImageButtonVisible       | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:223                                     | isAiImageButtonUsable        | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:223                                     | shownActionButtonCount       | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:224                                     | gateAcceptsInput             | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:225                                     | verifyCachedFileOrEvict      | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:227                                     | setColorSheet                | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:227                                     | overlayUrl                   | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:232                                     | probePort                    | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:233                                     | shouldWriteBlobsProbe        | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:238                                     | DeepReadonly                 | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:239                                     | gateAcceptsInput             | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:272                                     | isStoredPicture              | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:277                                     | assertReadableSchema         | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:278                                     | exportCanvasBlob             | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:291                                     | requiredArray                | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:702                                     | aiCredentialKind             | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:775                                     | DEFERRED_OWNERS              | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:845                                     | clearMocks                   | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:909                                     | ensureDevServer              | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:950                                     | createX                      | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:1054                                    | colorSheet                   | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:1054                                    | fillUrl                      | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:1057                                    | createDrawingEngine          | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:1057                                    | BrushType                    | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:1060                                    | MAX_RENDER_SCALE             | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:1060                                    | PROBE_CONTACT_BUDGET_MS      | Historical incident/example; current RN coverage is separately identified.                            |
| docs/CODING-STANDARDS.md:1060                                    | DISPLAY_COMMIT_CHARS         | Historical incident/example; current RN coverage is separately identified.                            |
| docs/MOBILE/android.md:344                                       | READ_CALL_LOG                | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| docs/MOBILE/compliance.md:243                                    | whenUnlockedThisDeviceOnly   | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| docs/MOBILE/ios.md:134                                           | UPSIDE_DOWN                  | Explicitly scoped historical platform measurement.                                                    |
| docs/ORIENTATION.md:105                                          | setRequestedOrientation      | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| docs/ORIENTATION.md:117                                          | isInterfaceOrientationLocked | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| docs/ORIENTATION.md:123                                          | SensorOrientation            | Explicitly scoped historical platform measurement.                                                    |
| docs/SAFE-AREA.md:112                                            | densityDpi                   | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| docs/TESTING.md:126                                              | aiCredentialKind             | Historical incident/example; current RN coverage is separately identified.                            |
| docs/TESTING.md:232                                              | __replayStroke               | Historical incident/example; current RN coverage is separately identified.                            |
| docs/WORKTREES.md:4                                              | EnterWorktree                | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| docs/WORKTREES.md:203                                            | WorktreeCreate               | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| tools/asset-gen/.ruler/AGENTS.md:85                              | NODE_PATH                    | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| tools/centerline-tracing/docs/pipeline.md:63                     | path_means                   | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| tools/device-parity/README.md:199                                | BTN_TOOL_FINGER              | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| tools/device-parity/README.md:199                                | INPUT_PROP_DIRECT            | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| tools/git-housekeeping/README.md:84                              | worktreePruneExpire          | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| tools/vectorize/README.md:503                                    | getBBox                      | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| tools/vectorize/README.md:515                                    | processingShapesMinAreaPx    | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| tools/vectorize/docs/api.md:24                                   | subscriptionPlan             | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| tools/vectorize/docs/api.md:24                                   | subscriptionState            | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |
| tools/vectorize/docs/errors.md:14                                | dataReceived                 | External API, tool/environment name, captured field, or intentionally prohibited platform capability. |

105 advisories retained; zero unresolved path/script references and zero stale exemptions.
