# scripts/ — repo automation

* Every script must run on both Windows (`cmd.exe`) and macOS/Linux (ADR-0017): plain Node `.mjs`, no bash-isms, no shelling out to platform-specific tools without a per-platform branch. Scripts bound to one platform by nature (`ios-simulator-smoke.mjs` needs Xcode) must fail fast with a clear message elsewhere.
* Shared helpers live in `scripts/lib/` — `android.mjs` resolves the SDK and AVD locations per platform (override the SDK with `ANDROID_HOME`); `utils.mjs` has the common run/log helpers plus the Maestro location. Check there before writing new glue.
* TypeScript-flavored scripts run via `node --experimental-strip-types` (see the `check:assets` npm script).
* Env vars in npm scripts go through `cross-env` so they work on Windows.
