# ADR-0037: Photo Save Targets per Platform (Native Gallery, Web Folder Save, Download Fallback)

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
| **Web — desktop Chromium** (Chrome/Edge, tab *or* installed PWA) **with a folder chosen** | `saveBlobToFolder` → File System Access writable into the parent-chosen folder | PNG written silently into that folder, **no download shelf** |
| **Web — desktop Chromium, no folder chosen** | `triggerDownload` (`<a download>`) | Normal browser download |
| **Web — Firefox / Safari / all mobile browsers** | `triggerDownload` | Normal browser download (the folder row is hidden) |

`isNative()` selects the native branch (unchanged). On the web, `saveImageBlob`
always tries `saveBlobToFolder` first and falls back to `triggerDownload`
whenever it returns `false` — which is every time there's no chosen folder
(including on browsers without the File System Access API), so those keep today's
exact download behaviour.

### An optional folder — fully decoupled from the save actions

This is a thin, opt-in convenience, **not** a reshaping of how saving works. An
earlier iteration made a chosen folder a *prerequisite* for the three save
features (gating the Screenshot button etc. and forcing them off at boot); that
was pared back because the coupling and changed defaults were disproportionate to
a desktop-Chromium-only win (see Consequences).

What remains is decoupled in both directions: **you can save without a folder**
(it just downloads), and **clearing the folder doesn't stop saving** (it reverts
to downloads). The presence of a chosen folder is the *only* thing that decides
where a web save lands — there's no separate enable flag and nothing is gated.

Folder management lives in a one-line **"Save drawings to"** row in the Parent
Center (`SettingsToggles.svelte`), shown only when `folderSaveSupported()`:

- No folder → a primary **Choose folder** button (`changeSaveFolder()` →
  `chooseSaveFolder()`, the picker inside the click's user activation).
- Folder set → a lighter secondary **pill showing the folder name** (click to
  re-pick) plus a circular **clear** button (`forgetSaveFolder()` →
  `clearSaveFolder()`, which just drops the handle).

`settings.saveFolderName` (reactive, not persisted) backs the display; it's
hydrated on boot from the stored handle by `hydrateSaveFolder()`, which has no
side effects on any save feature. When a save discovers the folder itself is
gone (moved/deleted), `folderSave` drops the stored handle and notifies the
settings mirror via `onSaveFolderCleared`, so the pill never keeps naming a
folder that no longer receives saves.

The `FileSystemDirectoryHandle` itself is structured-cloneable, so it lives in
IndexedDB (`splotch-fs` / `handles`) rather than localStorage (string-only),
through the shared lazy-`idb` helper (`lib/idb.ts`, also used by
`secureStorage.ts`). A localStorage flag records *that* a folder was chosen and
an in-memory copy caches the handle, so the common no-folder state never loads
the idb chunk at boot and repeated saves don't re-read IndexedDB. Folder writes
dedupe filenames with browser-download-style `(1)` suffixes, because save
filenames are second-resolution timestamps and a raw `createWritable` would
silently overwrite a same-second save.

### `allowPrompt`: who may raise a dialog at save time

`saveBlobToFolder(blob, filename, { allowPrompt })` takes `allowPrompt: true` for
user-initiated saves (the Screenshot button) and false for background saves. It
never opens the folder picker — that's a separate Parent Center action.
`allowPrompt` only lets a user-initiated save **re-confirm a write permission**
the browser dropped between sessions (in-tab origins lose it; installed PWAs keep
it). Background saves leave `allowPrompt` false and degrade to a download rather
than surprising anyone with a dialog.

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
