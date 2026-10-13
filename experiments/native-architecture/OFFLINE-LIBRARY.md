# Offline coloring library source candidate

The app downloads the seven additional complete coloring books on its own, as shipping does.
Dinosaurs is the first additional book. Parents see and manage the downloads in Settings › Coloring
(`rsdDrawing/RsdColoringSection.tsx`, the shipping `ColoringSection.svelte`): the Coloring book
switch, the "Download over mobile data" switch, and the "Downloaded pictures" storage card with its
Remove button. The kid-facing picker carries none of these controls. Installation verifies the
finite approved HTTPS file inventory, byte lengths and SHA-256 digests before publishing its marker.
Saved pictures retain their artwork revision when parents remove a book, including after offline
relaunch.

Generate the retained asset catalog directly with
`node --experimental-strip-types tools/migration/gen-offline-catalog.mjs`. Add `--check` to verify
its checked-in output. The root package manifest remains the exact authenticated joint-graph input;
adding a script would invalidate its existing evidence boundary. The direct CLI avoids changing the
script catalog or any dependency, lockfile, patch or build policy (ADR-0019).

Existing save and reopen behavior is exercised through the production file adapters.

The controller keeps a download failure or network-policy wait until something calls `retry()` or
changes the download policy; drawing never does. The app calls `retry()` for a failed or waiting
download when it returns to the foreground, and on web when the browser reports it is back online
(`useOfflineLibrary.ts`), as shipping's downloader retries on visibility and `online`. Removing
books commits disabled download policy before deleting files; an online relaunch respects that
policy until a parent turns Coloring book on or changes the mobile data choice, either of which
enables downloads again. If the policy write fails, installed books are kept.

Drawing and background pauses preserve the current owner’s staged files. Resume rechecks their exact
byte lengths and SHA-256 digests before skipping verified files, and checks storage for the
remaining bytes. A fresh owner discards interrupted staging rather than presenting it as a restored
native job. Only current catalog revisions appear as installed. Superseded verified revisions remain
private retained artwork until explicit removal can collect revisions unreferenced by saved or live
pictures.

Native network state remains checked before every accepted streamed chunk. The iOS bridge owns one
path monitor and cancels it when invalidated; both bridges cache their private root setup. Stream
checks avoid repeated JavaScript directory creation and disk-space reads. This is source and adapter
evidence; both platforms still require runtime and performance validation.

A terminated JavaScript transfer is discarded on the next launch; published and retained books are
reverified. This source does not claim durable OS background jobs. Native compilation, real OS
storage/network/cancellation behavior, rendered native offline reopen/export, and any future durable
background transfer adapter remain runtime gates. No legacy data or jobs are imported. This
candidate selects no migration framework.
