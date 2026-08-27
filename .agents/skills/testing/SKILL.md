---
name: testing
description: Full testing guide — the three-tier strategy (Vitest unit, Playwright E2E, Maestro native smoke on Android + iOS), every test command, CI workflow triggers, and Maestro installation. Use before writing, running, or modifying tests, or when debugging CI test failures.
---

# Splotch — Testing

The full guide is **[`docs/TESTING.md`](../../../docs/TESTING.md)**: the layer-by-layer table (tool,
command, and what CI runs it on), then a section per layer.

| Read this section        | When                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| The layer table (top)    | Picking which suite covers a change, or working out why CI ran something you didn't expect                                |
| Server-contract smoke    | Changing an `/api/*` endpoint, the adapter, or the Netlify config                                                         |
| Unit tests               | Writing Vitest for app code, the asset pipeline, store drawings, or repo scripts                                          |
| E2E web tests            | Writing or running Playwright — **including "Writing flake-resistant specs", the section that earns its keep most often** |
| Engine smoke / a11y tier | Touching the critical path or anything with a11y surface                                                                  |
| Cloud session gotchas    | Running Playwright inside a cloud session                                                                                 |
| Native smoke (Maestro)   | Android/iOS smoke runs, or installing Maestro for the first time                                                          |
| Continuous integration   | Debugging a CI failure, or deciding where a new suite should run                                                          |

The two rules worth carrying before you open it:

* **`npm test` is not everything.** It runs the unit suites plus E2E. The native Maestro smoke tests
  need an emulator/simulator and are deliberately excluded; `test:blobs:smoke` runs against a real
  deploy, not locally.
* **Concurrent worktrees share the host.** Run targeted specs with an explicit port —
  `SPLOTCH_E2E_PORT=<port> npm run test:e2e -- <spec> --workers=1` — and treat a full suite as
  host-exclusive (root `CLAUDE.md`, ADR-0078).

`.claude/rules/testing.md` loads automatically when you edit test files and carries the authoring
rules.
