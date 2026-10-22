---
name: run-splotch
description: Build, serve and screenshot the React Native web export to verify a change in the real app. Use when asked to run Splotch, open its web app, draw on the canvas or visually verify a UI change. For native builds use the mobile skill.
---

# Run Splotch on the web

Use the real RN export, served with Netlify's redirects, headers and the real API function. The
[`driver.mjs`](driver.mjs) helper launches Playwright Chromium and owns the server it starts.

## Prepare the export

```sh
pnpm install --frozen-lockfile
npm run test:e2e:install
npm run build:site
npm --silent run show:free-port
```

The driver serves an existing export; rebuild after a source edit. Run only the Chromium install
needed by the local check when browser installation cost matters. The full browser suite is
host-exclusive; a focused screenshot uses an explicit free port and stops only its own server.

## Capture and inspect

```sh
node .ruler/skills/run-splotch/driver.mjs --port 5330 --route / --draw --out screenshots/splotch-home.png
node .ruler/skills/run-splotch/driver.mjs --port 5330 --route /privacy --out screenshots/splotch-privacy.png
```

Open each PNG and inspect it. The drawing command verifies that the gesture produces ink; a blank
canvas is a failed check. For `/admin`, use the isolated credentials declared by
`e2e/server/serverEnv.ts`. That host reads no shell or dotenv credentials, and its model key cannot
authenticate. It is a local verification host, not a public deployment.

| Flag             | Effect                                                              |
| ---------------- | ------------------------------------------------------------------- |
| `--route <path>` | Export route, default `/`                                           |
| `--draw`         | Draw and verify a stroke on `/` before capturing                    |
| `--out <file>`   | Screenshot destination, default `screenshots/splotch.png`           |
| `--headed`       | Show Chromium                                                       |
| `--port <n>`     | Explicit port for the owned local host                              |
| `--keep`         | Keep that host running and print its process-group shutdown command |
| `--url <origin>` | Use an existing origin without owning or stopping it                |

For a more involved state, keep the local host and use the actual public controls with Playwright.
Reuse `e2e/support/app.ts` and `e2e/support/drawing.ts` readiness and drawing contracts. Avoid fixed
sleeps and removed engine globals; the RN app has no Svelte development routes.

Stop a kept host using the exact process group the driver printed. On `EADDRINUSE`, select another
free port. Never terminate an unrelated listener. Keep screenshots under the ignored `screenshots/`
directory and attach the states required by the `pr-screenshots` skill when creating a visible UI
PR.
