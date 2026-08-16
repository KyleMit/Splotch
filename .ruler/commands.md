## Commands

### Codex worktree bootstrap

Before the first repository command in every Codex session, check whether the developer context
contains `Splotch worktree bootstrap completed successfully.` If it does not, run
`node tools/bootstrap-codex-worktree.mjs` first. If that command prints JSON with
`"continue":false`, stop the turn and report its message. This instruction is the first-session
fallback for project command hooks that Codex has not yet trusted; when the trusted synchronous hook
runs, its completion context prevents the duplicate bootstrap.

| Command                       | Purpose                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `npm run info`                | List **every** npm script with its description — run this before guessing at a script |
| `npm run dev`                 | Dev server at `localhost:5173` (no `/api` functions)                                  |
| `npm run dev:netlify`         | Dev server **with** the `/api/*` serverless functions                                 |
| `npm run check`               | svelte-check / type checking                                                          |
| `npm test`                    | Run the CI test tiers declared by the `package.json` test entry                       |
| `npm run build` / `build:cap` | Web build / native static build                                                       |

Script naming and the `scripts-info` descriptions follow ADR-0019: `namespace:variant` names
(`dev:*`, `test:e2e:*`, `gen:*`, `android:*`, …), and every new or renamed script gets a matching
one-line entry in the `scripts-info` block of `package.json`.

## Concurrent worktrees

Codex-managed worktrees share host ports and machine capacity.

* Select an explicit unused port for every server. Run targeted Playwright checks as
  `SPLOTCH_E2E_PORT=<port> npm run test:e2e -- <spec> --workers=1`.
* Treat `EADDRINUSE` as a request to select another port and retry. Never run `npm run dev:stop` or
  `kill-port`, and never terminate a listener merely because it occupies a desired port. Stop only a
  PID, process group, or tool handle created and recorded by the current session.
* Full `npm test`/Playwright E2E suites, fixed-port Netlify workflows, performance runs, tunnels,
  and native-device runs are host-exclusive. ADR-0078 establishes that one Playwright suite already
  sizes itself to available CPU capacity; concurrent full suites invalidate that capacity model.
