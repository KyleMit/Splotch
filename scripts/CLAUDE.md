

<!-- Source: .ruler/AGENTS.md -->

# scripts/ - Repo Automation

* Every script must run on both Windows (`cmd.exe`) and macOS/Linux (ADR-0017): plain Node
  `.mjs`, no bash-isms, no shelling out to platform-specific tools without a per-platform
  branch. Scripts bound to one platform by nature (`ios-simulator-smoke.mjs` needs Xcode)
  must fail fast with a clear message elsewhere.
* Shared helpers live in `scripts/lib/`: `android.mjs` resolves SDK and AVD locations per
  platform; `utils.mjs` has common run/log helpers; `vite-server.mjs` spawns throwaway Vite
  servers without orphaning child processes; `smoke.mjs` has the pass-fail reporter. Check
  there before writing new glue.
* TypeScript-flavored scripts run via `node --experimental-strip-types`.
* Env vars in npm scripts go through `cross-env` so they work on Windows.
* Agent guidance scripts live here too. Keep `scripts/check-ruler-drift.mjs`
  cross-platform and update `package.json` `scripts-info` when adding Ruler-related npm
  scripts.
* The AI/`sharp` asset-generation pipeline moved to `tools/asset-gen/`. See
  `tools/asset-gen/docs/README.md`, `tools/asset-gen/docs/pipeline.md`, and
  `tools/asset-gen/AGENTS.md` before generating more.
* The app-driving `gen:*` generators that stay here, `gen:shots` and `gen-large-image`,
  drive the live app by selector through `scripts/lib/app-driver.mjs` and only run on
  demand. `test:driver:smoke` catches selector/import rot after app markup changes.
