# Abandoned direct SVG bitmap conversion, 2026-10-03

Status: rejected implementation, retained for comparison. This branch removes the canonical-extent
rasterization from PR #2631 and restores only `exportDrawing.ts` to the direct bitmap conversion
used at 8bff717e85635854d3985ba7e9099f37d754ffc4. It is intentionally unsuitable for merging.

## Attempt and failure

The immutable decoded canonical SVG is owned independently of the responsive displayed overlay.
Converting that retained `HTMLImageElement` directly with `createImageBitmap(image)` appeared to
preserve the decode without another network request. Chromium accepted it, and it removed an earlier
canonical-SVG refetch regression. Chromium correctness did not establish WebKit pixel fidelity.

A fresh WebKit run on 2026-10-03, 10:12:19–10:13:18 UTC, at 8bff717e85635854d3985ba7e9099f37d754ffc4
finished with seven passing tests and one failure, exit 1, without retries or a process timeout. The
existing `engine-export.spec.ts` test “a deferred page fill fallback captures the incoming page
appearance before its overlay settles” compares a held-camera fallback export with the subsequently
settled export of the same drawing. Live ink and output dimensions agreed; the PNGs differed by
468,888 pixels. The settled SVG occupied approximately 70.3% of its expected extent. The observed
SVG intrinsic extent was 1536×1024 while its responsive container was 1080×720.

This result rejects this conversion route in the tested WebKit environment. It is not evidence that
all Safari versions or all `createImageBitmap` inputs behave this way.

## Passing control and product decision

The replacement rasterizes the retained image into an OffscreenCanvas at its natural width and
height, then transfers the resulting bitmap. The pixel oracle and source drawing were unchanged. The
fresh WebKit run on 2026-10-03, 10:25:30–10:26:26 UTC, passed all eight tests, exit 0, with one
worker and zero retries. It ran on HEAD 8bff717e85635854d3985ba7e9099f37d754ffc4 plus the frozen
repair patch (SHA-256 `10cf2f7c7e2a877ef3f10e80181e95a5e7df0dfb12e0bfe493681e34d7fd2122`),
subsequently committed as d4567a483d389efc6e1124248bf731181b431a5a. That implementation remains in
PR #2631.

The decision is to preserve the immutable decode for resource ownership and zero-refetch behavior,
while enforcing canonical raster dimensions before the tiled export compositor receives it. The
final helper's WHY comment, dimension/lifetime unit guards, and unchanged browser pixel oracle are
the durable product protections.

## Reconstructing the comparison

This evidence branch is based on d4567a483d389efc6e1124248bf731181b431a5a. Its only production
change restores `web/src/lib/drawing/exportDrawing.ts` byte-for-byte from
8bff717e85635854d3985ba7e9099f37d754ffc4. All final browser and unit guards remain intact. Unit
fixtures added for the replacement intentionally assume canonical OffscreenCanvas rasterization;
this branch is not claimed to pass those guards.

For an explicit WebKit comparison, use the documented arbitrary-spec config rather than the normal
engine-smoke filter:

```sh
SPLOTCH_E2E_PORT=<unused-port> node tools/run-web-tool.mjs playwright test   -c playwright.webkit-scratch.config.ts tests/engine-export.spec.ts   -g 'a deferred page fill fallback' --workers=1 --retries=0
```

That scratch config performs a production build. A prebuilt flag does not skip its configured build
command. Reserve the host for the run and preserve the first result. This command is a reproduction
recipe, not a claim of a new execution on this archive branch.

The cited run results are historical, not new tests. Raw PNGs, traces, private campaign packets, and
absolute host paths remain local. Only source code and this result summary are published.
