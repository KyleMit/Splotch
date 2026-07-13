## Commands

| Command                       | Purpose                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `npm run info`                | List **every** npm script with its description — run this before guessing at a script |
| `npm run ruler:apply`         | Regenerate agent files from `.ruler/` and format them                                 |
| `npm run ruler:dry-run`       | List the agent files Ruler would regenerate without writing them                      |
| `npm run ruler:check`         | Regenerate and fail if committed agent files have drifted                             |
| `npm run dev`                 | Dev server at `localhost:5173` (no `/api` functions)                                  |
| `npm run dev:netlify`         | Dev server **with** the `/api/*` serverless functions                                 |
| `npm run check`               | svelte-check / type checking                                                          |
| `npm test`                    | Unit (Vitest) + E2E (Playwright) — what CI runs                                       |
| `npm run build` / `build:cap` | Web build / native static build                                                       |

Script naming and the `scripts-info` descriptions follow ADR-0019: `namespace:variant` names
(`dev:*`, `test:e2e:*`, `gen:*`, `android:*`, …), and every new or renamed script gets a matching
one-line entry in the `scripts-info` block of `package.json`.
