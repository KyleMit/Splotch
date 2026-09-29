# Installed-app launch flicker, 2026-09-28

A screen recording of the installed web app launching on a Samsung phone (dark theme, Flat button
style) showed the toolbar assembling itself over about a second and a half. This note records what
the recording shows, which parts reproduced where, what was changed, and what is still unexplained.

The recording itself is not committed: its opening frames show a personal home screen. The two
contact sheets here start after the app has taken the screen.

## What the recording shows

Times are seconds into the 5.3 s recording, sampled every 33 ms.

| Time      | What changes                                                                        |
| --------- | ----------------------------------------------------------------------------------- |
| 1.27–1.43 | Chrome's own bar (`✕ splotch.art ⋮`) fades in over the splash screen                |
| 1.47      | First app frame: four swatches, the fourth one black; a dark strip along the bottom |
| 1.70      | The More Colors swatch, the Clear Button, the drawer toggle and the Settings Button |
| 1.73      | The printed rule under the palette; the dark strip is gone                          |
| 1.90–2.03 | The fourth swatch fades from black to white                                         |
| 2.67      | The fourth swatch is black again and the rule is gone: a second document has loaded |
| 2.87–3.00 | The fourth swatch fades to white a second time                                      |
| 3.00–3.30 | A thin vertical line on the right edge, the length of the page, fading out          |

`recording-first-load.jpg` covers 1.67–2.10 and `recording-second-load.jpg` covers 2.60–3.03.

## Causes found in the app

Each of these reproduced in Playwright against the production build (`vite preview`, a 384 px wide
touch viewport, 4x CPU throttle, 4 Mbps down, 40 ms latency). The contact sheets are CDP screencast
frames labelled with milliseconds since navigation start.

1. **The Black swatch was themed in JavaScript.** The prerendered markup carried
   `background-color: #0a0b10`; hydration replaced it with white in a dark theme, and the swatch's
   `background-color` transition turned the correction into a fade. Dark theme only, either button
   style.
2. **The document paints in pieces.** The prerendered document is 178 KB (51 KB gzipped). The
   palette's flat swatches sit about 104 KB in, the Clear Button at 113 KB and the Settings Button
   at 176 KB, with the Actions Panel's inline icons between. Chrome painted after each parsed chunk,
   so controls appeared in markup order. Every theme and button style.
3. **The Flat toolbar's rule waited on a request.** Its `mask-image` named
   `/icons/margin-fiber-h.svg`, which is fetched after the first layout, so the rule arrived after
   the toolbar it edges (561 ms against a 128 ms first paint in the throttled run).
4. **The paper sheet lags a growing viewport.** The engine sizes `.paper-sheet` and settles a resize
   for `RESIZE_SETTLE_MS` before following it. While an installed app enters fullscreen the viewport
   grows, and the box behind the sheet showed `--paper-margin` past the sheet's edge. That is the
   dark strip: in the dark theme the margin tone is much darker than textured paper.

`playwright-before-dark-flat.jpg` shows 1, 2 and 3 together. `playwright-before-dark-raised.jpg` and
`playwright-before-light-flat.jpg` are the other combinations that were captured: the Raised style
shows 1 and 2, the light theme shows 2 and 3.

## What changed

| Cause | Change                                                                                                                                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | A themed `--black-swatch-ink` token fills the swatch, so the markup is the same in both themes and hydration has nothing to repaint     |
| 2     | `<link rel="expect" blocking="render">` on the drawing route holds the first paint until the last control in the markup has been parsed |
| 3     | The two fiber masks are inlined as data URIs, as the fullscreen glass mask already was                                                  |
| 4     | `.canvas-container` paints paper and texture, and the margin tone only while the sheet is lifted                                        |

`playwright-after-dark-flat.jpg` is the same throttled launch after the change: one blank frame and
then the complete toolbar. The later frames differ only by the Fullscreen Toggle, which mounts at
hydration in a browser tab and is not shown in an installed app.

### Cost

Holding the first paint moves it later. In the throttled Playwright run the first paint went from
128 ms to 288 ms (`controls/playwright-*-dark-flat.timeline.json`). Before the change the toolbar
was complete at 283 ms, the rule arrived at 561 ms and the swatch finished its fade near 860 ms, so
the first *complete* frame is earlier than it was. These are single runs on one machine and are not
a benchmark. That run also overstates the hold: `vite preview` serves the document uncompressed, so
the throttle was applied to 178 KB instead of the 51 KB a production host sends.

A second measurement isolates the hold. One build is served through a gzip proxy twice, once as
built and once with the `rel="expect"` link stripped from the document, so the link is the only
difference between the arms. Each cell is the median first paint of 15 runs per arm, arms
interleaved, in Playwright's Chromium with CDP throttling on a Mac. A warm visit has the document in
the HTTP cache and revalidates it, which is what a relaunch of the installed app does when nothing
has been deployed since.

| Profile                      | Visit | First paint, no hold | First paint, hold | Difference |
| ---------------------------- | ----- | -------------------- | ----------------- | ---------- |
| Unthrottled                  | cold  | 20 ms                | 36 ms             | 16 ms      |
| Unthrottled                  | warm  | 28 ms                | 32 ms             | 4 ms       |
| 20 Mbps, 20 ms RTT, 4x CPU   | cold  | 72 ms                | 92 ms             | 20 ms      |
| 20 Mbps, 20 ms RTT, 4x CPU   | warm  | 96 ms                | 104 ms            | 8 ms       |
| 9 Mbps, 60 ms RTT, 4x CPU    | cold  | 132 ms               | 140 ms            | 8 ms       |
| 9 Mbps, 60 ms RTT, 4x CPU    | warm  | 120 ms               | 144 ms            | 24 ms      |
| 1.6 Mbps, 150 ms RTT, 4x CPU | cold  | 328 ms               | 632 ms            | 304 ms     |
| 1.6 Mbps, 150 ms RTT, 4x CPU | warm  | 212 ms               | 236 ms            | 24 ms      |
| 1.6 Mbps, 150 ms RTT, 6x CPU | cold  | 336 ms               | 640 ms            | 304 ms     |
| 1.6 Mbps, 150 ms RTT, 6x CPU | warm  | 232 ms               | 236 ms            | 4 ms       |

Paint times are quantized to the frame, so differences under about 25 ms are one frame or less. The
hold is long only where the document itself is slow to arrive: on the cold 1.6 Mbps load the
document finishes downloading at 607 ms, and without the hold the first paint shows the half that
had arrived by 328 ms. In every row the held first paint lands within 40 ms of the moment the last
control is parsed, which is when the unheld page finishes assembling its toolbar. The rows and every
sample are in `controls/hold-cost.json`.

CPU throttling on a desktop is a weak stand-in for a phone's parser. The recording is the one real
device sample: its first partial frame is at 1.47 s and its toolbar is complete at 1.70 s, so on
that phone and that launch the hold would have been about 0.23 s.

The page-load gate (`npm run test:lighthouse:ci`, medians of three on the same Mac, the pre-change
source first and the changed source second) does not separate the two builds:

| Profile          | Visit  | FCP before / after | LCP before / after |
| ---------------- | ------ | ------------------ | ------------------ |
| Phone portrait   | first  | 1,976 / 1,902 ms   | 3,766 / 2,877 ms   |
| Phone portrait   | repeat | 639 / 639 ms       | 750 / 750 ms       |
| Tablet landscape | first  | 1,904 / 1,977 ms   | 2,878 / 3,764 ms   |
| Tablet landscape | repeat | 656 / 640 ms       | 1,874 / 900 ms     |

The two first-visit LCP values trade places between the profiles, which is the host's slow LCP mode
that `tools/page-load/README.md` describes, not an effect of the change. Both runs pass the gate.
The summaries are `controls/lighthouse-before.summary.json` and
`controls/lighthouse-after.summary.json`.

`rel="expect"` needs Chrome 124 or Safari 18.2. Older engines and Firefox ignore the link and paint
progressively as before; `docs/COMPATIBILITY.md` carries the row.

## Android emulator

Pixel 7 Pro AVD, API 33, Chrome 151, booted headless. The production site was installed from
Chrome's menu. Chrome could not mint a WebAPK without a Google account
(`WebAPK service unknown_account` in logcat) and fell back to a home-screen shortcut, which still
launches in Chrome's fullscreen app window.

`emulator-before.jpg` is a first launch of the production site (build 1.6.2005). It shows Chrome's
bar over the splash and then over the page, the page moving up when the bar leaves, the dark strip
under the drawer toggle and Settings Button, and the swatch fade. `emulator-after.jpg` is the local
build with the changes, installed the same way through `adb reverse`: the first frame carries the
white swatch, the rule and the controls together.

The headless emulator is a weak witness for anything else. Chrome crashed twice during relaunches
("Chrome keeps stopping", with a system-wide process kill in logcat), and its recordings show black
frames while Chrome enters fullscreen that no document request accounts for.

## Still open

### Chrome's bar flashing at launch

Reproduced on the emulator on a plain first launch, with no redirect, no restore and no service
worker. It is Chrome's window chrome, drawn before the page has painted, and the page shifts when it
leaves. Nothing in the app was found to cause it. Untested: whether `"display": "standalone"` in the
manifest launches without it.

### The second document load

Not reproduced. The recording shows it plainly, so something on the phone navigated the page about
1.2 s after its first paint. What was ruled out, by counting document requests through a logging
proxy in front of the preview server (`controls/emulator-document-requests.log.txt`, one `--- tap`
line per launch):

* A first launch: one document request.
* A relaunch after Chrome was killed in the background with a drawing on the canvas, which restores
  the tab on the Back-guard history entry: one document request. The boot script's `history.go()`
  back to the base entry is a same-document traversal. The Playwright equivalent
  (`controls/playwright-restore-with-drawing.log.txt`) agrees.
* A fresh launch under an active service worker: one document request.

The remaining candidate in the app is the stale-client recovery in `lib/pwa/updates.ts`:
`checkVersionMismatch()` replaces the location with `?v=<deployed version>` when the page's build
differs from `/version.json` and the canvas is blank. That needs the launch to have been answered
with the service worker's precached shell rather than the network's document, which the NetworkFirst
route does when the network request fails or exceeds its timeout. The timing fits, but nothing here
shows it happened. Remote-debugging the phone and watching for a `?v=` navigation on launch would
settle it.

### The line on the right edge

Seen only in the recording, after the second load. It looks like an overlay scrollbar fading out,
which would mean the page was briefly taller than the viewport. Not reproduced.

### The splash screen

Decided in ADR-0177; this is the evidence behind it.

The white splash came from `background_color` in the manifest. The W3C spec added a
`color_scheme_dark` member on 2026-04-09, but Chromium's manifest parser on `main` reads no dark
member (its earlier experiment, "Dark mode support for web apps", stopped at origin trial), while
WebKit's parser does read it. The launch screen is chosen from the operating system's color scheme,
before any page code runs, so it cannot follow the app's Appearance setting.

Three launches on the emulator, each a build installed from Chrome's menu as a home-screen shortcut:

| Build                                                                 | Launch screen                                   |
| --------------------------------------------------------------------- | ----------------------------------------------- |
| `background_color` `#ab71e1`, icons as shipped                        | The icon as a white square on the purple ground |
| The same, with a new any-purpose icon on a transparent ground         | Unchanged: Chrome drew the maskable icon        |
| The same, with a maskable icon on a `#ab71e1` ground and a white disc | The mascot on a white disc, no square           |

`emulator-splash-shipped-icon.jpg` is the first row and `emulator-splash-brand-maskable.jpg` the
third. `emulator-home-icons.jpg` shows the two home-screen icons, the shipped maskable icon on the
left.

So Android's launch screen draws the maskable icon when the manifest has one, and in this install
type draws it as the whole square. The home screen showed the shipped maskable icon cropped by its
round mask, the mascot running past the edge; the new one shows the whole mascot on the disc.

Not verified: the install a phone with a Google account gets. Chrome could not mint it on the
emulator.
