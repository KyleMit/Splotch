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
back to `triggerDownload` whenever `saveBlobToFolder` returns `false`.

### Folder selection: settings-first, save-time fallback

The directory picker is opened primarily from a deliberate **"Save to Folder"
toggle in the Parent Center** (`SettingsToggles.svelte`), shown only when
`folderSaveSupported()` is true. The first time a parent turns it on,
`chooseSaveFolder()` runs `showDirectoryPicker` + `requestPermission` (both need
transient user activation, which the toggle click provides) and persists the
granted `FileSystemDirectoryHandle` in IndexedDB (`splotch-fs` / `handles`).
After that the toggle flips on/off freely without re-prompting; cancelling the
picker leaves the setting off. This keeps folder choice a parent decision, so in
the normal flow the kid's Screenshot button never raises a dialog.

A `FileSystemDirectoryHandle` is structured-cloneable, so it lives in IndexedDB
rather than localStorage (string-only) — mirroring the lazy-`idb` pattern in
`secureStorage.ts`. The boolean toggle persists through the normal localStorage
settings table.

Because those two stores can drift apart, the **save path is the fallback**: a
user-initiated save with the toggle on but no folder set re-runs the picker (see
`allowPrompt` below). So the toggle isn't a hard precondition — it expresses
intent, and the folder is guaranteed to exist by the time a save completes
silently.

### `allowPrompt`: who may raise a dialog at save time

`saveBlobToFolder(blob, filename, { allowPrompt })` takes `allowPrompt: true` for
user-initiated saves (the Screenshot button) and false for background saves. When
true it may, from within the user gesture, (a) **pick a folder** if none is set
yet and (b) **re-confirm a write permission** the browser dropped between
sessions (in-tab origins lose it; installed PWAs keep it). This save-time pick is
the safety net that makes the toggle self-healing: if `saveToFolderEnabled` is on
but no handle exists — a fresh enable, a cleared IndexedDB, an older build — the
next Screenshot prompts for a folder and then saves into it, instead of silently
downloading. Background saves leave `allowPrompt` false and degrade to a download
rather than surprising anyone with a dialog.

The Parent Center toggle still prompts immediately on enable, so the common path
sets the folder up front and no save ever raises a dialog; the save-time pick
only fires in the anomalous on-without-folder state. We deliberately do **not**
reconcile the flag off when the folder is missing — the flag is treated as
*intent*, and the missing folder is resolved lazily, which removes the
localStorage/IndexedDB desync as a way to get wedged into silent downloads.

## Consequences

- **+** Desktop parents (especially of the installed PWA, where the grant
  persists) get the native-like "saves just land in a folder" experience, with no
  download shelf — the original goal.
- **+** One entry point (`saveImageBlob`) and one matrix; the web enhancement is
  additive and every unsupported browser keeps today's exact download behaviour.
- **+** No new dependency — reuses the already-present `idb` and the platform's
  File System Access API; ambient types are hand-declared in `app.d.ts`.
- **−** The silent path is desktop-Chromium only. Firefox, Safari, and all mobile
  web stay on the download; the toggle is simply hidden there, so the win is
  uneven across browsers.
- **−** For an in-tab (non-installed) desktop origin, the write permission can
  lapse between sessions, so the first user-initiated save of a session may show
  a one-time permission re-confirm before going silent again; background saves in
  that window quietly download instead.
- **−** The happy path can't be driven in happy-dom or Playwright (no real
  picker), so `folderSave.test.ts` covers the dispatch/permission/fallback logic
  with mocks and the end-to-end folder write is verified manually.
- **−** Mobile has no silent option here; a Web Share sheet
  (`navigator.share({ files })`) for mobile web is a deliberate future follow-up,
  not part of this decision.
