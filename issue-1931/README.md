# Issue 1931 native migration evidence

Captured 2026-09-16 on an Android emulator (Pixel_7_Pro_API_33, API 33) and an iOS simulator
(iPhone 17 Pro, iOS 26.5). Both devices select the `full` resolution.

Builds:

* `old-main`: origin/main at d0414eac34a4309a62aad31bdfafcf57cb99c76a. It stores books under
  `coloring/1.6.0-full/<book>` and downloads from splotch.art.
* `new`: the PR head, unmodified. It downloads from splotch.art.
* `evidence-m1` (iOS) and `evidence-m2` (both platforms): the PR head plus
  `scripts/evidence-build-patch.diff`. The patch points the native download base at a local logging
  server (`scripts/serve.py`, `adb reverse` on Android) and allows cleartext for that server. The
  patch does not touch plugin or store code. `m1` bundles the real manifest. `m2` bundles a manifest
  that drops `vehicles` and changes the `full` bytes of `/coloring/dinosaur/trex-wide.light.webp` to
  the 1,152 px derivative, which the local server serves at that path.

Every store snapshot is checked by `scripts/inspect-store.mjs`. A book is `trusted` only when its
marker equals the manifest's marker value. A **violation** is a trusted book with any missing or
mismatched file. Every run recorded zero violations.

| Scenario | Android | iOS |
| --- | --- | --- |
| Old build installs 7 books | `android/s0-inspect.json` | `ios/s0-inspect.json` |
| Update with unchanged packs | Offline (airplane mode): 7 trusted, 518/518 files kept with original mtime and bytes (`android/s1-*`) | Logging server: 0 requests, 7 trusted, 518/518 kept with the same inode (`ios/s1-*`, `ios/server-unchanged-update.log`) |
| Changed file + removed book (`m2`) | 1 request for the changed file, 443 kept, `vehicles` (74 files) deleted (`android/s2-*`) | Same result, with the same inodes for the 443 kept files (`ios/s2-*`) |
| Kill during migration | 16 kills, 11 mid-migration, 0 violations; every relaunch: 7 trusted, 518 kept, 0 rewritten (`android/kill-summary.txt`) | 16 kills (`kill -9`), 10 mid-migration, 0 violations; same relaunch result (`ios/kill-summary.txt`) |
| Kill during changed-file download | Killed at 24 KB of 53 KB: `dinosaur` unmarked, 73/74 valid plus `.part`. Relaunch downloaded only that file and marked the book (`android/s3-*`, `android/s4-*`) | Killed mid-transfer: `dinosaur` unmarked, 73/74 valid. The background session finished the transfer, and the relaunch published it with one request in total (`ios/s3-*`, `ios/s4-*`) |
| Remove downloaded pictures | `ColoringPacks.remove()` over the bridge emptied the coloring root (`android/remove-after.txt`) | Not exercised on device (simulator UI access was unavailable) |

In the kill summaries, `newNsFiles` and `legacyFiles` include each book's marker file.

`android/server-m2-resume.log` also holds a second request at 22:27:54. It came from the removal
setup that followed, which restored the pre-`m2` layout under the `m2` build and so legitimately
fetched the changed file again. The resume snapshot (`android/s4-*`) was taken at 22:27:15.
