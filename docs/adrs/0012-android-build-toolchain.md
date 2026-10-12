# ADR-0012: Android Build Toolchain Requirements (Node 22 + JDK 21 Temurin)

**Status:** Active — **amended** by [ADR-0062](0062-drop-windows-dev-support.md): Windows dev
support was dropped, so the Windows-specific mechanics recorded below (nvm-windows,
`%LOCALAPPDATA%`, `cmd.exe`, `gradlew.bat`, `cross-env`) no longer apply. The core requirements —
**Node ≥ 22** and a **full JDK 21** — still hold on macOS and Linux.\
**Date:** 2026-06-01

## Context

Building the Splotch Android app (Capacitor 8 + AGP/Gradle) on Windows has non-obvious toolchain
requirements that differ from what a default Node.js or Android Studio installation provides.

**Node version:** `@capacitor/cli` requires Node ≥ 22 (enforced via `engines` in its
`package.json`). With `engine-strict=true` in the project's `.npmrc`, even `npm install` and
`cap sync` hard-fail on Node 18/20 (`EBADENGINE`), not just the build itself.

**Java version and distribution:** Capacitor 8 plugins require a Java 21 toolchain. Android Studio
ships a bundled JetBrains Runtime (JBR), but:

* JBR is only Java **17**, below the Capacitor 8 minimum.
* JBR is a **JRE-style** distribution that omits `jlink` and `jmods`. AGP's `JdkImageTransform`
  requires `jlink`; without it the build fails with "jlink executable does not exist".

A full JDK 21 (Eclipse Temurin recommended) with `jlink` present must be used.

## Decision

* **Node 22** (installed via nvm-windows, e.g. `22.11.0`). `nvm use` requires an elevated shell to
  make it the persistent default; otherwise prepend the nvm version directory to `PATH` for the
  session.
* **JDK 21 (Eclipse Temurin)** installed at `C:\Users\kylemit\.jdks\jdk-21.0.11+10`. `JAVA_HOME` is
  set to this path at user scope. In Android Studio, Gradle JDK must also be explicitly set to this
  JDK (Studio will not use `JAVA_HOME` automatically).
* **Android SDK** at `%LOCALAPPDATA%\Android\Sdk`. The SDK path is recorded in the git-ignored
  `android/local.properties` (`sdk.dir=...`) rather than via the `ANDROID_HOME` environment variable
  (which is not set at user scope on this machine).
* Env vars in npm scripts are set inline (`CAPACITOR=true …`), which works in the macOS/Linux shell
  npm uses (ADR-0062 removed the `cross-env` shim that Windows `cmd.exe` had needed).

The `android:*` npm scripts invoke the Gradle wrapper through `scripts/gradle.mjs`, which resolves
`./gradlew` to an absolute path and spawns it from `android/` (ADR-0017), keeping the npm scripts
free of an inline `cd android && ./gradlew` shell dance.

## Consequences

* **+** Documented requirements prevent hours of debugging "why does this build fail on a clean
  checkout."
* **+** `npm run android:bundle` (and the other `android:*` scripts) work identically on macOS and
  Linux.
* **-** Two separate Java installations may be present (JBR in Android Studio, Temurin for builds);
  it's easy to configure the wrong one in Android Studio's Gradle JDK setting.
