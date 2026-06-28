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
| **Web — desktop Chromium** (Chrome/Edge, tab *or* installed PWA) | `saveBlobToFolder` → File System Access writable into the parent-chosen folder | PNG written silently into that folder, **no download shelf** |
| **Web — Firefox / Safari / all mobile browsers** | `triggerDownload` (`<a download>`) | Normal browser download |

`isNative()` selects the native branch (unchanged). On the web, `saveImageBlob`
always tries `saveBlobToFolder` first and falls back to `triggerDownload`
whenever it returns `false` — which is *every* time on browsers without the File
System Access API, so those keep today's exact download behaviour with no extra
gate.

### A chosen folder is the prerequisite for the save features — no separate toggle

There is intentionally **no "save to folder" switch**. On a folder-capable
browser, the directory *is* the enablement: the three save features —
**Screenshot button**, **Auto-Save on Delete**, **Auto-Save AI** — can't be
turned on until a folder is picked, and that single folder receives all of them.

`toggleSaveFeature(set, next)` (in `settings.svelte.ts`) wraps each feature's
toggle. Turning one on with no folder yet runs `chooseSaveFolder()`
(`showDirectoryPicker` + `requestPermission`, both inside the toggle click's user
activation) and only enables the feature if a folder is granted; cancelling
leaves it off. So a parent literally cannot arm saving without choosing a
destination — done once, set and forget. On browsers without the API the wrapper
is a plain setter and the features behave as before (download).

Because the features can't be enabled without a folder, `hydrateSaveFolder()`
runs at boot (web/desktop only): it loads the folder name from the stored handle
into `settings.saveFolderName`, and if no folder is set it forces those three
features **off**. That's what makes them default off on a fresh desktop until a
folder is chosen, and it self-heals the case where the handle is lost
(cleared site data, IndexedDB eviction) but the feature flags persisted on.

A `FileSystemDirectoryHandle` is structured-cloneable, so it lives in IndexedDB
(`splotch-fs` / `handles`) rather than localStorage (string-only) — mirroring the
lazy-`idb` pattern in `secureStorage.ts`. `settings.saveFolderName` is derived
from it (not persisted) so the Parent Center can show the location.

### Parent Center: the folder location, not a toggle

`SettingsToggles.svelte` shows a one-line **"Save drawings to"** row (when
`folderSaveSupported()`). With no folder it offers a primary **Choose folder**
button; once set, that becomes a lighter secondary **pill showing the folder
name** (click to re-pick via `changeSaveFolder()`) plus a circular **clear**
button that forgets it (`forgetSaveFolder()` → `clearSaveFolder()` + turn the
three features off, mirroring the boot state). This replaces the earlier toggle
and gives parents a proactive entry point: choose the folder up front, then the
save features enable without a prompt. The parent sees *where* photos go and can
repoint or clear it, rather than flipping an opaque switch.

### `allowPrompt`: who may raise a dialog at save time

`saveBlobToFolder(blob, filename, { allowPrompt })` takes `allowPrompt: true` for
user-initiated saves (the Screenshot button) and false for background saves. When
true it may, from within the user gesture, (a) **pick a folder** if none is set
yet and (b) **re-confirm a write permission** the browser dropped between
sessions (in-tab origins lose it; installed PWAs keep it). The folder-pick here
is a pure safety net: features can't be enabled without a folder, so in normal
use one already exists by save time; it only fires if the handle was lost
mid-session. Background saves leave `allowPrompt` false and degrade to a download
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
  web stay on the download (the folder row is hidden and the save features keep
  their normal defaults there), so the win is uneven across browsers.
- **−** On desktop Chromium the Screenshot button is **off by default** until a
  parent picks a folder — a deliberate gate, but it means the save button isn't
  present out of the box the way it is on other browsers/native.
- **−** For an in-tab (non-installed) desktop origin, the write permission can
  lapse between sessions, so the first user-initiated save of a session may show
  a one-time permission re-confirm before going silent again; background saves in
  that window quietly download instead.
- **−** The real picker can't be driven in happy-dom or Playwright, so
  `folderSave.test.ts` covers the dispatch/permission/fallback logic with mocks;
  the end-to-end folder write and the boot-force are verified against a real
  handle by substituting the Origin Private File System in a headless run.
- **−** Mobile has no silent option here; a Web Share sheet
  (`navigator.share({ files })`) for mobile web is a deliberate future follow-up,
  not part of this decision.
