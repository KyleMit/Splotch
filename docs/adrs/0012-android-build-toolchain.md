# ADR-0012: Android Build Toolchain Requirements (Node 22 + JDK 21 Temurin)

**Status:** Active  
**Date:** 2026-06-01

## Context

Building the Splotch Android app (Capacitor 8 + AGP/Gradle) on Windows has non-obvious toolchain requirements that differ from what a default Node.js or Android Studio installation provides.

**Node version:** `@capacitor/cli` requires Node ≥ 22 (enforced via `engines` in its `package.json`). With `engine-strict=true` in the project's `.npmrc`, even `npm install` and `cap sync` hard-fail on Node 18/20 (`EBADENGINE`), not just the build itself.

**Java version and distribution:** Capacitor 8 plugins require a Java 21 toolchain. Android Studio ships a bundled JetBrains Runtime (JBR), but:
- JBR is only Java **17**, below the Capacitor 8 minimum.
- JBR is a **JRE-style** distribution that omits `jlink` and `jmods`. AGP's `JdkImageTransform` requires `jlink`; without it the build fails with "jlink executable does not exist".

A full JDK 21 (Eclipse Temurin recommended) with `jlink` present must be used.

## Decision

- **Node 22** (installed via nvm-windows, e.g. `22.11.0`). `nvm use` requires an elevated shell to make it the persistent default; otherwise prepend the nvm version directory to `PATH` for the session.
- **JDK 21 (Eclipse Temurin)** installed at `C:\Users\kylemit\.jdks\jdk-21.0.11+10`. `JAVA_HOME` is set to this path at user scope. In Android Studio, Gradle JDK must also be explicitly set to this JDK (Studio will not use `JAVA_HOME` automatically).
- **Android SDK** at `%LOCALAPPDATA%\Android\Sdk`. The SDK path is recorded in the git-ignored `android/local.properties` (`sdk.dir=...`) rather than via the `ANDROID_HOME` environment variable (which is not set at user scope on this machine).
- **cross-env** is used in npm scripts so `CAPACITOR=true` works under Windows `cmd.exe` (npm's default shell on Windows), which doesn't support `VAR=value command` syntax.

Gradle scripts use `.\gradlew` (not bare `gradlew`) because `NoDefaultCurrentDirectoryInExePath=1` is set on this machine — cmd.exe won't find an executable in the current directory without the explicit `.\` prefix. This makes the scripts Windows-specific; on macOS/Linux use `./gradlew`.

## Consequences

- **+** Documented requirements prevent hours of debugging "why does this build fail on a clean checkout."
- **-** Two separate Java installations may be present (JBR in Android Studio, Temurin for builds); it's easy to configure the wrong one in Android Studio's Gradle JDK setting.
- **-** `nvm use` requires elevation — an easy step to forget when opening a new terminal.
- **-** The `.\gradlew` syntax in npm scripts means they won't work unmodified on macOS/Linux; use `cap run android` or `./gradlew` directly on those platforms.
