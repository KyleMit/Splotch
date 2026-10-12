# ADR-0110: Recover Worker Canvas Context Loss with One Full Replay

**Status:** Active — amends [ADR-0088](0088-frame-bound-screenshot-export-on-ipad-webkit.md) and
[ADR-0091](0091-alpha-overlays-and-worker-magic-sheets.md); live-surface exclusion amended by
[ADR-0132](0132-recover-reset-live-tile-contexts-on-resume.md) **Date:** 2026-08

## Context

The PNG encoder and Magic-sheet rasterizer each create a disposable `OffscreenCanvas` inside a
cached worker. A GPU reset, graphics-memory failure, or driver crash can invalidate that canvas's 2D
context while the worker request is in flight. The brokers already bound silent workers with a
15-second deadline, but an operation could otherwise continue against reset drawing state or wait
until that deadline after the browser had already reported the loss.

The HTML canvas model exposes `contextlost`, `contextrestored`, and `isContextLost()`. Restoration
resets the drawing state and does not reconstruct the bitmap. Browser support is progressive at
Splotch's floor: Chromium has the events and probe from version 99 and Firefox from 125, while
Safari and iOS do not implement them. Splotch therefore cannot make recovery-event support a
correctness requirement.

We considered relying only on the existing worker timeout, immediately failing every lost request,
and replaying on the main thread. The timeout is bounded but leaves a known failure pending and does
not guard against a successfully completed blank result. Immediate failure discards work even when
the worker still owns every source needed to reconstruct it. Main-thread replay would regress the
frame-bound worker decisions in ADR-0088 and ADR-0091, and transferred tiled-export inputs are not
available to the client for replay.

The live tiled drawing surfaces are deliberately outside this decision. Their pixels, active stroke,
and retained raster history need a separate reconstruction policy; browser restoration alone cannot
recreate them.

## Decision

`canvasContextRecovery.ts` wraps only disposable worker-owned 2D surfaces. It attaches loss and
restoration listeners before an operation starts and probes `isContextLost()` before dispatch and
after completion when that method exists. The operation races the loss event so an in-flight encode
cannot remain pending after a reported loss.

On the first loss, the wrapper gives browser restoration one second. A restored context reruns the
whole operation on the reset surface. If restoration does not arrive, the wrapper creates a fresh
canvas and context instead. Either path counts as the single retry. A second loss rejects with the
stable `canvas-context-recovery-failed` code. Ordinary decode, paint, and encoding errors are never
retried.

Full replay is safe because the source inputs stay inside the worker until its `finally` block:

* `pngEncoder.worker.ts` retains whole-canvas and tiled `ImageBitmap` inputs while it repaints and
  encodes. `paintTiledPngSurface()` reapplies paper, texture, smoothing, transforms, compositing,
  tiles, and overlay from the request rather than trusting restored context state. If a provisional
  polaroid preview was already delivered, replay sends a corrected preview that repaints the
  existing animation rather than starting a second one.
* `magicSheet.worker.ts` retains its decoded fill bitmap while it redraws the contain fit and edge
  extensions. The replay does not refetch or re-decode the image.

If the single retry also loses its context, the worker sends the stable failure code. The client
retires that worker and settles every pending broker request. A whole-canvas PNG request uses its
existing main-thread fallback because its source canvas remains available. A tiled PNG request
returns `null` because its transferred inputs cannot be safely replayed by the client; the next tap
gets a fresh worker. Magic-sheet requests use the existing synchronous raster fallback.

On engines without the events and probe, listeners remain inert and the probe is skipped. The
existing 15-second worker deadline and correctness fallbacks remain authoritative. A timed-out Magic
sheet request retires the silent worker and fails only that request; other requests from that worker
are re-dispatched with their original deadlines. No user-agent or version detection is added.

## Consequences

* \+ Supported Chromium and Firefox versions can recover a transient worker canvas loss without
  waiting for the broker deadline or returning a reset bitmap.
* \+ Every replay reconstructs pixels and drawing state from request inputs; it never assumes that
  browser restoration preserves either.
* \+ Terminal loss, worker errors, message decode failures, and post failures retire the affected
  worker and settle all of its pending requests. A timeout retires the same worker without stealing
  the remaining budget from concurrent requests.
* \+ Deterministic unit tests dispatch loss and restoration through a controlled canvas seam and
  cover pre-dispatch loss, in-flight loss, between-request isolation, successful replay, failed
  restoration or recreation, repeated loss, worker replacement, and pending-request cleanup.
* − A context loss may add up to one second before a fresh-surface replay while the implementation
  waits for browser restoration.
* − Safari/iOS and Firefox 114–124 cannot report Canvas 2D context loss. They retain the prior
  timeout and fallback behavior, so an undetected loss can still consume the full deadline.
* − The live tiled canvas remains unrecoverable by this mechanism. Adopting recovery there still
  requires an explicit raster-history, active-stroke, memory-pressure, and user-feedback decision.
* − Synthetic tests establish state-machine correctness but cannot reproduce a real GPU reset.
  Physical-device normal-path performance and fault behavior remain release validation concerns.
