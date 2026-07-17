# ADR-0062: macOS and Linux Development Support Only

**Status:** Active **Date:** 2026-07

## Context

Splotch previously treated Windows as a first-class development platform. That requirement
introduced Windows-only Gradle wrapper handling, command-shell branching, package patches, and
`cross-env` for portable environment-variable assignments. The project now only needs to support
development on macOS and Linux.

Keeping the Windows compatibility layer would leave untested paths and extra dependencies in the
repository. We considered retaining it as a best-effort convenience, but that would continue to make
the supported-platform boundary ambiguous. We also considered moving the compatibility logic to a
smaller wrapper, but no Windows behavior is required any longer.

## Decision

Support development tooling only on macOS and Linux. npm scripts may use POSIX inline environment
assignments. Shared automation invokes Unix executables directly and uses the committed `./gradlew`
wrapper for Android builds.

Remove the Windows-only Capacitor CLI patch, `patch-package`, `cross-env`, the Windows Gradle
wrapper, and Windows-specific branches from repository scripts and developer documentation. Android
SDK defaults remain macOS (`~/Library/Android/sdk`) and Linux (`~/Android/Sdk`), with `ANDROID_HOME`
and `ANDROID_SDK_ROOT` available as overrides.

ADR-0011 is deprecated and ADR-0017 is superseded by this record.

## Consequences

* \+ Supported tooling has a clear macOS/Linux contract and less platform-specific process handling.
* \+ Native builds no longer need the Capacitor Windows Gradle workaround or `cross-env`.
* \+ Script execution uses direct argument spawning where a shell is not required.
* − Contributors cannot use the documented npm, Android, or native workflows from Windows.
* − Restoring Windows support requires reinstating and validating the removed compatibility paths.
