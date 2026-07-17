# ADR-0011: patch-package for Capacitor CLI Windows gradlew Bug

**Status:** Deprecated\
**Date:** 2026-06

## Context

`@capacitor/cli` (through 8.4.1) hard-codes the Gradle invocation as `'./gradlew'` and spawns it via
`cross-spawn` with a `cwd` pointing to the Android project directory. On Windows, `cross-spawn`
resolves the executable relative to the **process** working directory (the repo root), not the spawn
`cwd` option — so `./gradlew` is looked up at the repo root, where it doesn't exist. Result:

```
'gradlew' is not recognized as an internal or external command
```

This breaks `cap run android` and `cap build android`. The error affects four spawn sites in the
CLI: `android/run.js`, `android/build.js`, `android/add.js`, `tasks/migrate.js`.

Options:

* **Fork `@capacitor/cli`** — maintainable long-term, but adds a fork to track and rebase.
* **Wrapper shell script** — invokes `gradlew` directly, bypassing `cap run` entirely (this is
  already done for `android:apk`, `android:run`, `android:bundle` scripts).
* **patch-package** — applies a diff against the installed package on every `npm install`; the fix
  is local, reviewable, and disposable when upstream fixes the bug.

## Decision

Use `patch-package` to patch the four affected spawn sites in `@capacitor/cli@8.4.1`. The patch
replaces `'./gradlew'` with a platform-aware absolute path:

```js
process.platform === 'win32'
  ? join(platformDirAbs, 'gradlew.bat')
  : './gradlew';
```

The patch lives at `patches/@capacitor+cli+8.4.1.patch` and is re-applied automatically via
`postinstall: patch-package` in `package.json`.

The affected npm scripts (`android:apk`, `android:run`, `android:bundle`, `android:clean`) avoid
`cap run` entirely — they invoke the Gradle wrapper via `scripts/gradle.mjs` — so only
`android:emulator` (which uses `cap run android`) requires the patch.

## Consequences

* **+** Fixes the bug without forking or maintaining a separate repository.
* **+** The patch filename is version-pinned (currently `8.4.1`), so a semver bump prints a loud
  mismatch warning at `postinstall` — a prompt to re-verify rather than a silent wrong-version
  apply. (patch-package still *applies* the diff if the patched spawn sites are byte-identical, as
  they were 8.3.4 → 8.4.1; the warning is the signal to regenerate.)
* **-** When `@capacitor/cli` is upgraded, regenerate the patch so its filename tracks the new
  version and the warning clears: run `npx patch-package @capacitor/cli`, then delete the old
  `patches/@capacitor+cli+<old>.patch`. If a future release changes the spawn sites, re-apply the
  edits before regenerating.
* **-** The patch is Windows-specific; the `process.platform === 'win32'` branch makes it safe on
  macOS/Linux (which never took that branch), but developers on those platforms may not notice if
  the patch degrades.
