# Undo ghosts on physical devices — 2026-09-17

Evidence for issue #1775: the tile-read undo ghosts from #1772 (overlapping crayon, magic ink) and
the reduced-motion gate, recorded on a physical iPad and a physical Android phone.

## Build and devices

* Commit: `origin/main` da9f4070643901a6ce8327b5182278ff26f35b9d, built locally. Web targets served
  from `npm run build` + `vite preview` on the LAN; native targets are debug builds of the bundled
  static export (`https://localhost` in the Android WebView).
* iPad Pro 12.9-inch (5th generation), iPadOS 26.5 (23F77), ProMotion on (Limit Frame Rate off).
  Targets: Safari, and the native app (WKWebView).
* Samsung Galaxy S21 FE (SM-G990U1), Android 16, 120 Hz. Targets: Chrome 153.0.8010.47, and the
  native app (Android System WebView 151.0.7922.199).

## How it was driven and recorded

* iPad: WebDriverAgent W3C touch actions for every tap and stroke; recording is XCTest's own screen
  recording (`/wda/video/start`), which writes a frame only when the screen changes, capped at 60
  fps. The iPad clips were downscaled to 1920 px with `avconvert`; frame timing is unchanged.
* Android: Chrome DevTools Protocol touch events for every tap and stroke (Chrome's DevTools socket,
  or the debug WebView's); recording is `adb shell screenrecord`, up to 120 fps, also written only
  on change.
* Crayon case: clear, crayon + Yellow gentle wave, crayon + Blue wave crossing it four times, then
  record from about one second before tapping Undo until after the ghost ends.
* Magic case: Farm book, Cat page, magic brush zig-zag over the cat and sky, then Undo.
* Reduced motion: iPad Settings → Accessibility → Motion → Reduce Motion; Android
  `settings put global animator_duration_scale 0` (the Remove animations switch). The page's
  `matchMedia('(prefers-reduced-motion: reduce)')` was read before every Android run. Both settings
  were restored afterwards (iPad Reduce Motion off; Android setting deleted, as it was unset).

Every clip plays at normal speed.

## Files

| File                               | What it is                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `1775-<target>-crayon.mp4`         | Crayon undo, normal motion                                                      |
| `1775-<target>-magic.mp4`          | Magic-ink undo on the Cat page, normal motion                                   |
| `1775-<target>-reduced-crayon.mp4` | Crayon undo with reduced motion                                                 |
| `1775-<target>-reduced-magic.mp4`  | Magic-ink undo with reduced motion                                              |
| `1775-ghost-curves.png`            | Ghost ink per recorded frame, every run, against what the CSS keyframes predict |
| `1775-crayon-frames.png`           | Crayon frames per target at fixed offsets from the last full-stroke frame       |
| `1775-magic-frames.png`            | The same for magic ink                                                          |
| `ghost-ink-curves.txt`             | The numbers behind the chart: `target case run seconds ghost-ink`               |

`<target>` is `ipad-native`, `ipad-safari`, `android-chrome`, or `android-native`.

## The ghost-ink measure

Each frame is compared pixel by pixel with the last frame of its clip (ink gone). Crayon sums the
excess of blue over red and green; magic sums the absolute RGB difference. The sum is normalized to
the steady frames before Undo on the iPad and to the frame before Undo on Android (whose clips hold
no steady run before the tap), so 1 is the whole stroke and 0 is nothing left. The dashed curve is
`(1 − p) × (1 − 0.28p)²` with `p` the `--ease-glide` curve over 420 ms — opacity times the area of a
stroke scaled toward 0.72 — which is an approximation of how much ink the ghost should put on
screen, not an exact render.

Two limits of the measure:

* Android's hardware encoder refines detail over several frames after a large change. The
  reduced-motion Android Chrome clips, where no ghost is on screen, read about 0.15 on the first
  frame after the ink goes and decay to 0 over about 250 ms; an amplified difference image shows
  that residue as whole-screen edges rather than a stroke. The same residue sits under the Android
  ghost curves, so read their tails, not their first frames, as inflated.
* Whether older yellow ink moved was checked separately: the yellow ink's centroid moves by under 10
  video pixels during the ghost, and not monotonically, while the ghost drifts by far more.

## Runs

iPad native crayon ×4, iPad Safari crayon ×3, Android Chrome crayon ×3, Android native crayon ×3;
magic ×1 and each reduced-motion case ×1 per target. Seven Android native runs were set aside and
recaptured: four recorded after the reduced-motion setting was restored still reported reduced
motion (the WebView reads it at process start, so the app was force-stopped and relaunched), and
three magic attempts never got the coloring page's reveal onto the paper.
