# Offline coloring library source candidate

The app downloads the seven additional complete coloring books on its own, as shipping does.
Dinosaurs is the first additional book. Parents see and manage the downloads in Settings › Coloring
(`rsdDrawing/RsdColoringSection.tsx`, the shipping `ColoringSection.svelte`): the Coloring book
switch, the "Download over mobile data" switch, and the "Downloaded pictures" storage card with its
Remove button. The kid-facing picker carries none of these controls. Installation verifies the
finite approved HTTPS file inventory, byte lengths and SHA-256 digests before publishing its marker.

Generate the retained asset catalog directly with
`node --experimental-strip-types tools/migration/gen-offline-catalog.mjs`. Add `--check` to verify
its checked-in output. The root package manifest remains the exact authenticated joint-graph input;
adding a script would invalidate its existing evidence boundary. The direct CLI avoids changing the
script catalog or any dependency, lockfile, patch or build policy (ADR-0019).

The controller keeps a download failure or network-policy wait until something calls `retry()` or
changes the download policy; drawing never does. The app calls `retryStalled()` when it returns to
the foreground, and on web when the browser reports it is back online or its connection changes
(`useOfflineLibrary.ts`), as shipping's downloader retries on visibility, `online` and connection
`change`. That ambient retry only retries a failed or waiting download: a removal or cancel keeps
its pause, even when the removal itself failed.
