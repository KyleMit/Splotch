# ADR-0012: Android Build Toolchain Requirements (Node 22 + JDK 21 Temurin)

**Status:** Active\
**Date:** 2026-06-01

## Context

Building the Splotch Android app (Capacitor 8 + AGP/Gradle) on macOS and Linux has non-obvious
toolchain requirements beyond a default Node.js or Android Studio installation.

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

* **Node 22** via `nvm`.
* **A full JDK 21** (Eclipse Temurin recommended) with `jlink` present. Set `JAVA_HOME` to that JDK
  and select it as Android Studio's Gradle JDK.
* **Android SDK** at the standard platform location (`~/Library/Android/sdk` on macOS,
  `~/Android/Sdk` on Linux), or set `ANDROID_HOME`/`ANDROID_SDK_ROOT` to override it. The setup
  script writes the resolved path to git-ignored `android/local.properties`.
* npm scripts use inline POSIX environment assignments such as `CAPACITOR=true`.

The `android:*` scripts invoke the committed `./gradlew` wrapper through `scripts/gradle.mjs` from
`android/`.

## Consequences

* **+** Documented requirements prevent hours of debugging "why does this build fail on a clean
  checkout."
* **+** `npm run android:bundle` and the other `android:*` scripts work identically on macOS and
  Linux.
* **-** Two separate Java installations may be present (JBR in Android Studio, Temurin for builds);
  it's easy to configure the wrong one in Android Studio's Gradle JDK setting.
