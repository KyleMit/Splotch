# ADR-0033: Photo Save Targets per Platform (Native Gallery, Web Folder Save, Download Fallback)

**Status:** Active
**Date:** 2026-06

## Context

Saving a drawing is the app's one "keep this" action, reached three ways, all of
which funnel through `saveImageBlob(blob, baseName?, opts?)` in
`web/src/lib/drawing/screenshot.ts`:

- **User-initiated** — the Screenshot button (`saveScreenshot`), which also plays
  the polaroid animation.
- **Background** — Auto-Save on Delete (`saveOnDelete.ts`) and AI auto-save
  (`aiImage.ts`), which save silently and own their own feedback.

Where the bytes land has always been platform-specific, but the behaviour was
scattered across the native gallery branch and a plain web download, with no one
place describing the full matrix. Two facts forced a decision worth recording:

1. On the **web**, every save used an `<a download>` click, which pops the
   browser's download shelf / "show in folder" toast on *each* save — fine once,
   grating when a toddler saves many in a row. Native already avoids this by
   writing straight into the photo library.
2. The **File System Access API** (`window.showDirectoryPicker` + a persisted
   `FileSystemDirectoryHandle`) can write files silently into a folder the parent
   chooses — but only on desktop Chromium. It is absent in Firefox, Safari, and
   every mobile browser, so it can only be an enhancement layered over the
   existing download, never a replacement.

## Decision

Keep a single save entry point and branch by target. The full matrix:

| Target | Path | Result |
| --- | --- | --- |
| **Native — Android** | `@capacitor-community/media` `savePhoto` into a `"Splotch"` album (created once) | Drawing appears in the gallery's Splotch album |
| **Native — iOS** | `@capacitor-community/media` `savePhoto` (add-only permission) | Drawing appears in the camera roll |
| **Web — desktop Chromium** (Chrome/Edge, tab *or* installed PWA) **with "Save to Folder" on** | `saveBlobToFolder` → File System Access writable into the parent-chosen folder | PNG written silently into that folder, **no download shelf** |
| **Web — desktop Chromium, "Save to Folder" off (default)** | `triggerDownload` (`<a download>`) | Normal browser download |
| **Web — Firefox / Safari / all mobile browsers** | `triggerDownload` | Normal browser download (the toggle is hidden) |

`isNative()` selects the native branch (unchanged). On the web, the folder write
is attempted only when the **`saveToFolderEnabled`** setting is on, and falls
back to `triggerDownload` whenever `saveBlobToFolder` returns `false` — which is
*every* time on browsers without the File System Access API, so those keep
today's exact download behaviour.

### One optional, additive toggle — deliberately kept small

This is intentionally a thin, opt-in enhancement, **not** a reshaping of how
saving works. An earlier iteration made a chosen folder a prerequisite for the
three save features (gating the Screenshot button etc. and forcing them off at
boot); that was pared back because the coupling and the changed defaults were
disproportionate to a desktop-Chromium-only win (see Consequences).

What remains: a single **"Save to Folder"** toggle in the Parent Center
(`SettingsToggles.svelte`), shown only when `folderSaveSupported()`, default off.
Turning it on runs `chooseSaveFolder()` (`showDirectoryPicker` +
`requestPermission`, both inside the toggle click's user activation) and only
flips the setting on if a folder is granted; cancelling leaves it off. Toggling
off keeps the remembered folder, so re-enabling doesn't re-prompt. Nothing else
changes: the three save features keep their normal defaults and behaviour, and on
unsupported browsers the toggle simply isn't shown.

A `FileSystemDirectoryHandle` is structured-cloneable, so it lives in IndexedDB
(`splotch-fs` / `handles`) rather than localStorage (string-only) — mirroring the
lazy-`idb` pattern in `secureStorage.ts`.

### `allowPrompt`: who may raise a dialog at save time

`saveBlobToFolder(blob, filename, { allowPrompt })` takes `allowPrompt: true` for
user-initiated saves (the Screenshot button) and false for background saves. It
never opens the folder picker — that is toggle-driven. `allowPrompt` only lets a
user-initiated save **re-confirm a write permission** the browser dropped between
sessions (in-tab origins lose it; installed PWAs keep it). Background saves leave
`allowPrompt` false and degrade to a download
rather than surprising anyone with a dialog.

## Consequences

- **+** Desktop parents (especially of the installed PWA, where the grant
  persists) get the native-like "saves just land in a folder" experience, with no
  download shelf — the original goal.
- **+** One entry point (`saveImageBlob`) and one matrix; the web enhancement is
  additive and every unsupported browser keeps today's exact download behaviour.
- **+** No new dependency — reuses the already-present `idb` and the platform's
  File System Access API; ambient types are hand-declared in `app.d.ts`.
- **−** The silent path is desktop-Chromium only. Firefox, Safari, and all mobile
  web stay on the download (the toggle is hidden there), so the win is uneven
  across browsers — for a thin slice of a secondary platform. We accept that
  because the cost is small and fully contained: a self-contained module guarded
  by `folderSaveSupported()`, with no change to defaults or to any other feature.
- **−** For an in-tab (non-installed) desktop origin, the write permission can
  lapse between sessions, so the first user-initiated save of a session may show
  a one-time permission re-confirm before going silent again; background saves in
  that window quietly download instead.
- **−** The real picker can't be driven in happy-dom or Playwright, so
  `folderSave.test.ts` covers the dispatch/permission/fallback logic with mocks;
  the end-to-end folder write is verified against a real handle by substituting
  the Origin Private File System in a headless run.
- **−** Mobile has no silent option here; a Web Share sheet
  (`navigator.share({ files })`) for mobile web is a deliberate future follow-up,
  not part of this decision.
