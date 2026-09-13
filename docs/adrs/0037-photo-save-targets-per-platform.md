# ADR-0037: Photo Save Targets per Platform (Native Gallery, Web Folder Save, Download Fallback)

**Status:** Active **Date:** 2026-06

## Context

Saving a drawing is the app's one "keep this" action, reached three ways, all of which funnel
through `saveImageBlob(blob, baseName?, opts?)` in `web/src/lib/drawing/screenshot.ts`:

* **User-initiated** — the Screenshot button (`saveScreenshot`), which also plays the polaroid
  animation.
* **Background** — Auto-Save on Delete (`saveOnDelete.ts`) and AI auto-save (`aiImage.ts`), which
  save silently and own their own feedback.

Where the bytes land has always been platform-specific, but the behaviour was scattered across the
native gallery branch and a plain web download, with no one place describing the full matrix. Two
facts forced a decision worth recording:

1. On the **web**, every save used an `<a download>` click, which pops the browser's download shelf
   / "show in folder" toast on *each* save — fine once, grating when a toddler saves many in a row.
   Native already avoids this by writing straight into the photo library.
2. The **File System Access API** (`window.showDirectoryPicker` + a persisted
   `FileSystemDirectoryHandle`) can write files silently into a folder the parent chooses — but only
   on desktop Chromium. It is absent in Firefox, Safari, and every mobile browser, so it can only be
   an enhancement layered over the existing download, never a replacement.

## Decision

Keep a single save entry point and branch by target. The full matrix:

| Target                                                                                    | Path                                                                                                                                | Result                                                                      |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Native — Android**                                                                      | App-local `PhotoLibrary` plugin (`androidGallery.ts`) inserting into shared `Pictures/Splotch` (see the 2026-09-13 amendment below) | Drawing appears in the gallery's Splotch album and survives an uninstall    |
| **Native — iOS**                                                                          | `@capacitor-community/media` `savePhoto` (add-only permission)                                                                      | Drawing appears in the camera roll                                          |
| **Web — desktop Chromium** (Chrome/Edge, tab *or* installed PWA) **with a folder chosen** | `saveBlobToFolder` → File System Access writable into the parent-chosen folder                                                      | PNG, WebP, or JPEG written silently into that folder, **no download shelf** |
| **Web — desktop Chromium, no folder chosen**                                              | `triggerDownload` (`<a download>`)                                                                                                  | Normal browser download                                                     |
| **Web — Firefox / Safari / all mobile browsers**                                          | `triggerDownload`                                                                                                                   | Normal browser download (the folder row is hidden)                          |

`isNative()` selects the native branch (unchanged). On the web, `saveImageBlob` always tries
`saveBlobToFolder` first and falls back to `triggerDownload` whenever it returns `false` — which is
every time there's no chosen folder (including on browsers without the File System Access API), so
those keep today's exact download behaviour.

### An optional folder — fully decoupled from the save actions

This is a thin, opt-in convenience, **not** a reshaping of how saving works. An earlier iteration
made a chosen folder a *prerequisite* for the three save features (gating the Screenshot button etc.
and forcing them off at boot); that was pared back because the coupling and changed defaults were
disproportionate to a desktop-Chromium-only win (see Consequences).

What remains is decoupled in both directions: **you can save without a folder** (it just downloads),
and **clearing the folder doesn't stop saving** (it reverts to downloads). The presence of a chosen
folder is the *only* thing that decides where a web save lands — there's no separate enable flag and
nothing is gated.

Folder management lives in a one-line **"Save drawings to"** row in Settings
(`SettingsToggles.svelte`), shown only when `folderSaveSupported()`:

* No folder → a primary **Choose folder** button (`changeSaveFolder()` → `chooseSaveFolder()`, the
  picker inside the click's user activation).
* Folder set → a lighter secondary **pill showing the folder name** (click to re-pick) plus a
  circular **clear** button (`forgetSaveFolder()` → `clearSaveFolder()`, which just drops the
  handle).

`settings.saveFolderName` (reactive, not persisted) backs the display; it's hydrated on boot from
the stored handle by `hydrateSaveFolder()`, which has no side effects on any save feature. When a
save discovers the folder itself is gone (moved/deleted), `folderSave` drops the stored handle and
notifies the settings mirror via `setSaveFolderClearedListener`, so the pill never keeps naming a
folder that no longer receives saves.

The `FileSystemDirectoryHandle` itself is structured-cloneable, so it lives in IndexedDB
(`splotch-fs` / `handles`) rather than localStorage (string-only), through the shared lazy-`idb`
helper (`lib/idb.ts`, also used by `secureStorage.ts`). A localStorage flag records *that* a folder
was chosen and an in-memory copy caches the handle, so the common no-folder state never loads the
idb chunk at boot and repeated saves don't re-read IndexedDB. Folder writes dedupe filenames with
browser-download-style `(1)` suffixes, because save filenames are second-resolution timestamps and a
raw `createWritable` would silently overwrite a same-second save.

### `allowPrompt`: who may raise a dialog at save time

`saveBlobToFolder(blob, filename, { allowPrompt })` takes `allowPrompt: true` for user-initiated
saves (the Screenshot button) and false for background saves. It never opens the folder picker —
that's a separate Settings action. `allowPrompt` only lets a user-initiated save **re-confirm a
write permission** the browser dropped between sessions (in-tab origins lose it; installed PWAs keep
it). Background saves leave `allowPrompt` false and degrade to a download rather than surprising
anyone with a dialog.

## Consequences

* **+** Desktop parents (especially of the installed PWA, where the grant persists) get the
  native-like "saves just land in a folder" experience, with no download shelf — the original goal.
* **+** One entry point (`saveImageBlob`) and one matrix; the web enhancement is additive and every
  unsupported browser keeps today's exact download behaviour.
* **+** No new dependency — reuses the already-present `idb` and the platform's File System Access
  API; ambient types are hand-declared in `app.d.ts`.
* **−** The silent path is desktop-Chromium only. Firefox, Safari, and all mobile web stay on the
  download (the toggle is hidden there), so the win is uneven across browsers — for a thin slice of
  a secondary platform. We accept that because the cost is small and fully contained: a
  self-contained module guarded by `folderSaveSupported()`, with no change to defaults or to any
  other feature.
* **−** For an in-tab (non-installed) desktop origin, the write permission can lapse between
  sessions, so the first user-initiated save of a session may show a one-time permission re-confirm
  before going silent again; background saves in that window quietly download instead.
* **−** The real picker can't be driven in happy-dom or Playwright, so `folderSave.test.ts` covers
  the dispatch/permission/fallback logic with mocks; the end-to-end folder write is verified against
  a real handle by substituting the Origin Private File System in a headless run.
* **−** Mobile has no silent option here; a Web Share sheet (`navigator.share({ files })`) for
  mobile web is a deliberate future follow-up, not part of this decision.

## Amendment (2026-09-13): the shared helper no longer wraps a third-party package

The mechanism above is unchanged — the handle still lives in `splotch-fs` / `handles`, still reached
through `lib/idb.ts`, and the localStorage flag still keeps the no-folder path from loading the
chunk or opening IndexedDB. Only the layer underneath moved: `lib/idb.ts` now calls
`lib/idbDatabase.ts`, an in-repo promise wrapper over the IndexedDB API, rather than the `idb`
package.

That retires the "no new dependency — reuses the already-present `idb`" consequence, which read as a
reason to prefer this design and no longer describes anything: there is no third-party package on
this path to reuse or to avoid.

## Amendment (2026-09-13): Android saves land in shared Pictures, not app-specific storage

The Android row originally used `@capacitor-community/media`. Outside its `androidGalleryMode`, that
plugin creates its albums under `Context.getExternalMediaDirs()`, which is
`Android/media/art.splotch.app/`: app-specific storage. The gallery indexes it, so the album looked
right, but Android deletes the directory with the app. Reproduced on the API 33 emulator: a saved
drawing was in Google Photos and in MediaStore before `adb uninstall`, and in neither afterwards.
For an app whose one "keep this" action is saving a child's drawing, uninstalling, reinstalling, or
moving phones silently lost every saved picture.

`androidGalleryMode` would move the album but needs `READ_MEDIA_IMAGES`, a sensitive read permission
that Play reviews and that a drawing app that never reads the library cannot justify. So Android now
saves through an app-local plugin, `PhotoLibraryPlugin.java`, reached from
`web/src/lib/drawing/androidGallery.ts`:

* **API 29+** inserts a `MediaStore.Images` row with `RELATIVE_PATH = Pictures/Splotch`, held
  `IS_PENDING` until the bytes are written and deleted if the write fails. Files the app creates
  through MediaStore need no permission, and MediaStore renames a same-second duplicate.
* **API 24–28** has no `RELATIVE_PATH`. The first save requests the manifest's existing
  `WRITE_EXTERNAL_STORAGE` (`maxSdkVersion="28"`) and writes the public `Pictures/Splotch`
  directory, then scans the file into MediaStore. If the parent denies the prompt, the save still
  lands in the gallery, written to the app-specific media directory that needs no permission — the
  pre-amendment location, which the uninstall removes. Only a never-answered permission prompts:
  after any denial, later saves go straight to that fallback without asking again, until a grant in
  system Settings turns shared Pictures back on. Failing the save instead would turn one denied
  prompt, possibly tapped by the child, into a camera button that never works again; re-asking on
  every tap would put a system dialog in front of the child each time.

The plugin accepts only PNG, JPEG, and WebP, with a plain file name whose extension matches the
type; `androidGallery.test.ts` reads the Java source to hold that contract to the TS side.

iOS keeps `@capacitor-community/media`, which saves to the camera roll with add-only permission. The
package therefore stays installed, and Capacitor links every installed plugin into both platforms,
so its Android module still compiles into the APK, unreachable from JS. Excluding it would need an
`android.includePlugins` allowlist in `capacitor.config.json` that every future plugin must be added
to; for a measured 134 KB (1.7%) of the unsigned release APK, that allowlist is not worth
maintaining.

Drawings saved before this change stay where they are, in the app-specific album, and are not
migrated. Only closed-testing builds shipped the old path, and copying them would duplicate every
picture in Photos until the originals were deleted.
