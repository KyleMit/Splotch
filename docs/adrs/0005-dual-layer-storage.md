# ADR-0005: Dual-Layer Storage (localStorage + Capacitor Preferences)

**Status:** Active  
**Date:** 2025

## Context

Splotch settings (sounds, save-on-delete, stroke width preference, drawer state, etc.) must be persisted across sessions on both web and native.

- On **web**, `localStorage` is the natural choice: synchronous reads let `$state` stores initialize without async flashes in the UI.
- On **native (iOS/Android)**, `localStorage` inside a Capacitor WebView can be evicted by the OS under storage pressure (especially on iOS), silently resetting user preferences. The Capacitor `@capacitor/preferences` plugin writes to `UserDefaults` (iOS) or `SharedPreferences` (Android), which the OS does not evict.

Using `@capacitor/preferences` exclusively would require all reads to be async, causing a visible initialization flash or requiring a loading state on every settings-driven UI element.

## Decision

Implement **dual-layer storage** in `src/lib/storage.ts`:

- **Reads** are always synchronous from `localStorage`. This is the primary fast path — no async flash.
- **Writes** go to `localStorage` synchronously, and on native are additionally mirrored to Capacitor Preferences as a fire-and-forget async call. A failed durable write is swallowed silently (the localStorage copy still holds the value).
- **On native app launch**, `hydrateDurableStorage()` reconciles the two layers: any key missing from localStorage is restored from Preferences (recovering from OS eviction), and any key present in localStorage but absent from Preferences is backed up. All managed keys are fetched from Preferences concurrently (not serially) to minimize cold-start latency.
- `localStorage.setItem()` calls are wrapped in a try/catch (`safeLocalStorage`) to handle `QuotaExceededError` and `SecurityError` without interrupting the toggle that triggered the write.

On web, `isNative()` returns false and the Preferences layer is never touched.

## Consequences

- **+** Zero async flash on initialization — state stores read synchronously from localStorage on every platform.
- **+** iOS localStorage eviction is recovered on next launch without user-visible data loss.
- **+** No behavioral difference between web and native from the app's perspective; `storage.ts` is the only place that knows about the native layer.
- **-** Two writes per setting change on native (localStorage + Preferences async).
- **-** A brief window exists between a write and its async mirror completing, so a crash in that window could lose the write on next launch. In practice this is negligible for user preference data.
- **-** All keys that flow through `readX`/`writeX` are tracked in a `managedKeys` Set at module load; a key only appears in that set if it has been read at least once before `hydrateDurableStorage()` runs.
