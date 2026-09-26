## Commands

| Command                       | Purpose                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `npm run info`                | List **every** npm script with its description — run this before guessing at a script |
| `npm run dev`                 | Dev server at `localhost:5173` (no `/api` functions)                                  |
| `npm run dev:netlify`         | Dev server **with** the `/api/*` serverless functions                                 |
| `npm run check`               | svelte-check / type checking                                                          |
| `npm test`                    | Run the CI test tiers declared by the `package.json` test entry                       |
| `npm run check:quality`       | Mirror CI's Quality job locally, reporting every failed step                          |
| `npm run test:browserless`    | Mirror CI's Browserless tests job (Vitest tiers + API smoke, no Playwright)           |
| `npm run build` / `build:cap` | Web build / native static build                                                       |

Script naming and the `scripts-info` descriptions follow ADR-0019: `namespace:variant` names
(`dev:*`, `test:e2e:*`, `gen:*`, `android:*`, …), and every new or renamed script gets a matching
one-line entry in the `scripts-info` block of `package.json`.

Judge checks by their exit codes, not a grep over output; `svelte-check --fail-on-warnings` can
print uppercase `WARNING` lines. Format edited files before linting, then run `npm run check` and
`npm run lint` for each reviewable code commit. Before pushing, run the applicable full test tier:
some guard tests inspect files outside the directory you edited. A normally fast command that
exceeds its timeout needs immediate process and output inspection. For work with an active-time
budget, read the clock at decision points instead of estimating elapsed time from effort.

## Concurrent worktrees

Agent-managed worktrees — Claude Code's and Codex's alike — share host ports and machine capacity. A
new worktree provisions itself; see `docs/WORKTREES.md` before changing that setup.

* Select an explicit unused port for every server. Run targeted Playwright checks as
  `SPLOTCH_E2E_PORT=<port> npm run test:e2e -- <spec> --workers=1`.
* Treat `EADDRINUSE` as a request to select another port and retry. Never run `npm run dev:stop` or
  `kill-port`, and never terminate a listener merely because it occupies a desired port. Stop only a
  PID, process group, or tool handle created and recorded by the current session.
* Full `npm test`/Playwright E2E suites, fixed-port Netlify workflows, performance runs, tunnels,
  and native-device runs are host-exclusive. ADR-0078 establishes that one Playwright suite already
  sizes itself to available CPU capacity; concurrent full suites invalidate that capacity model.
* Do not run `npm run test:tools` alongside a performance build or capture. The host load and port
  contention can make tool tests fail spuriously; rerun an observed failure alone before assigning
  it to the code change.
