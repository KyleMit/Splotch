# React Native web static first paint — spike evidence, 2026-10-19

The working behind [ADR-0180](../../adrs/0180-rn-web-paints-a-prerendered-first-frame.md)
(proposed): measurements, the harness that produced them, and the checks behind each claim. The base
is `origin/codex/native-migration` at 0cc444886 (Expo SDK 57.0.26, React Native Web 0.21.0, React
19.2.3).

## Method

* **Builds.** Each variant is an `npm run native:web:build` export, copied aside and served by
  `harness/serve-brotli.mjs`. That server sends brotli quality 11, makes `_expo/static/` and
  `assets/` immutable, sends `no-cache` for everything else, and answers `If-None-Match` with 304 as
  a CDN does. The first round ran without 304s. That inflated repeat visits through the favicon,
  which browsers fetch outside the service worker, so the repeat rows marked "(304)" replace them.
* **Lighthouse.** `harness/run-lh.mjs` uses the repository's pinned Lighthouse 13.5.0 and the
  `tools/page-load` profiles: phone 412×915 at 2.625×, tablet 1133×744 at 2×, mobile form factor. It
  runs three samples per cell, simulated Slow 4G and 4× CPU ("simulate") or no throttling
  ("provided"). A repeat visit primes a fresh profile with one first visit, then reruns with
  `--disable-storage-reset`. Rows are in `results/*.rows.json`; the tables show medians. The host
  was an Apple-silicon Mac, idle apart from the run.
* **Applied throttling.** `harness/tti-probe.mjs` drives Chromium through the DevTools protocol:
  Slow 4G with 562.5 ms latency and 1,474.56 kbps down, 4× CPU, cache disabled, phone 412×915. It
  records first contentful paint, Largest Contentful Paint, **handlers**, the first frame in which
  the Purple swatch carries React props (a tap would be handled), and **settled**, when the
  client-only clear underlay mounts. Output is in `results/applied-throttling.log.txt`.

| Variant    | What it is                                                                                                                                                        |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseline` | `codex/native-migration` as is: an empty root, only the boot script's paper colour before the bundle                                                              |
| `proto2`   | The prerendered first frame (12 variants), hydrated; the bundle requested with the document (`<script defer>`)                                                    |
| `proto4`   | `proto2`, with the bundle loaded once the frame's `first-contentful-paint` is reported                                                                            |
| `proto5`   | `proto4`, plus the saved-settings fallback: a visitor with a settings, brush or drawer record gets the empty root (the PR's build)                                |
| `shell`    | The baseline, plus a hand-authored full-viewport textured-paper layer in the root, the texture preload and the `proto4` bundle loading (`harness/make-shell.mjs`) |
| `shell2`   | `shell`, with the layer placed where the app's paper is, under the phone palette bar or beside the tablet palette column (`harness/make-shell2.mjs`)              |

## Results

Simulated (Slow 4G, 4× CPU), first visit, medians of three, milliseconds:

| Variant  | Phone FCP | Phone LCP | Phone SI | Tablet FCP | Tablet LCP | Tablet SI | CLS   |
| -------- | --------- | --------- | -------- | ---------- | ---------- | --------- | ----- |
| baseline | 1,051     | 2,820     | 1,161    | 1,051      | 2,818      | 1,161     | 0.009 |
| proto2   | 751       | 2,338     | 751      | 751        | 2,338      | 751       | 0     |
| proto4   | 751       | 1,201     | 751      | 751        | 1,201      | 909       | 0     |
| proto5   | 751       | 1,201     | 901      | 751        | 1,201      | 751       | 0     |
| shell    | 752       | 2,818     | 1,147    | 751        | 2,816      | 1,137     | 0.009 |
| shell2   | 752       | 1,202     | 1,138    | 751        | 1,201      | 1,128     | 0.009 |

Simulated repeat visit, with 304 revalidation: LCP is 900 ms for baseline, proto4, proto5 and shell,
and 750 ms for proto2.

Unthrottled ("provided"), first visit, LCP: baseline 67–68 ms, proto2 24–33 ms, proto4 25–34 ms,
proto5 30 ms. shell's LCP was 110–112 ms, because its paint was not taken as a candidate; shell2's
was 24–29 ms.

Applied throttling, phone, medians of three:

| Variant  | FCP   | LCP   | Handlers | Settled |
| -------- | ----- | ----- | -------- | ------- |
| baseline | 3,068 | 3,772 | 3,062    | 3,802   |
| proto2   | 1,276 | 1,276 | 3,090    | 3,752   |
| proto4   | 1,280 | 1,280 | 3,137    | 3,786   |
| proto5   | 1,284 | 1,284 | 3,123    | 3,800   |
| shell2   | 1,264 | 1,264 | 3,143    | 3,833   |

Startup path (`check-native-web-startup.mjs`): baseline 869,659 bytes, proto5 876,019 bytes. The cap
is 870,798. proto5 adds:

* +2,090 in the entry chunk;
* −59 in `__common`;
* +1,649 of boot script;
* +2,680 of inlined critical CSS.

The shell is 925 bytes brotli at baseline and 7,304 (210,790 raw) with twelve variants.

## Findings

1. **What Lantern credits.** Lantern's LCP estimate counts every request started before the
   *observed* LCP. With the bundle deferred by the parser, the 870 KB bundle starts before the
   prerendered frame paints. So proto2 paints at 30 ms observed and still scores 2,338 ms simulated.
   Loading the bundle when Paint Timing reports `first-contentful-paint` moves it after the paint;
   `requestAnimationFrame` plus a task was tried first and still started it about 26 ms before the
   paint was presented. Under applied throttling proto2 and proto4 paint at the same time (1,276 and
   1,280 ms). On this localhost run, holding the bundle cost 47 ms of interactivity (handlers at
   3,090 against 3,137 ms).
2. **The rest of first-visit LCP.** Most of the 450 ms left between FCP and LCP is the favicon and
   manifest icon. The browser fetches them at the `load` event, and holding the bundle lets `load`
   fire before the paint is presented. Shipping requests the same files.
3. **A full-viewport paper layer is not taken as the LCP candidate.** The `shell` layer painted at
   27 ms (its FCP), but LCP stayed on the app's own paper texture at 110 ms. The same layer placed
   where the app's paper is (`shell2`) was taken, at 1,202 ms. A hand-authored shell therefore has
   to reproduce the paper's geometry per size class. It then matches the prerender's LCP, but not
   its Speed Index (1,138 against 751 ms), because the palette and controls still arrive with the
   bundle.
4. **Expo Router's cost.** An empty Expo Router 57.0.28 app exports 1,089,327 startup bytes (227,065
   brotli) as a single-page app and 1,105,622 with `web.output: "static"`. The same empty app on
   `registerRootComponent` is 325,042 (81,520 brotli), in `results/expo-router-cost.log.txt`. The
   router adds about 764 KB to the startup path, close to the whole 870,798-byte cap.
5. **Babel's `minifyTypeofWindow` on web.** It is a stable `babel-preset-expo` option, off on web
   only because of Web Workers, which this app has none of. It shrinks the entry chunk by 1,824
   bytes, not enough to pay for the prerender, and it was not kept.

## Checks behind the ADR's claims

* **Static frame against hydrated screen, pixel for pixel** (`harness/pixel-compare.mjs`,
  `results/pixel-compare.log.txt`). It screenshots the frame with the bundle blocked, then the
  hydrated, settled screen.
  * At every variant viewport, light and dark, 0 pixels differ.
  * At 390×844, an off-variant viewport, 3.6% differ: the palette swatches respace (gap 12.4 → 8 px)
    and the Clear Button's edge shifts (`screens/off-variant-390x844-diff.webp`).
* **No stale attributes after hydration** (`harness/stale-attrs.mjs`,
  `results/hydrated-vs-fresh.log.txt`, with each settled DOM in `results/dom/`). The check compares
  each element and attribute, with styles normalised through the CSSOM, between the settled DOM
  after hydrating the shell and the settled DOM of a fresh client render. The fresh render serves
  the export's own non-prerendered `404.html` at `/`, with the same bundle.
  * They are identical at 412×915, 390×844, 844×390, 820×1180, 1133×744 (dark) and 1366×1024.
  * They are identical for a visitor with a saved drawer state, who gets no prerendered frame.
  * Neither render logged a console error.

  React 19 keeps a mismatched attribute silently in production, so this is the check that would
  catch one.

## Reproduce

```bash
npm run native:web:build
```

```bash
node docs/scratchpad/2026-10-19-rn-web-static-first-paint/harness/serve-brotli.mjs experiments/native-architecture/dist/web 5305
```

```bash
node docs/scratchpad/2026-10-19-rn-web-static-first-paint/harness/run-lh.mjs http://127.0.0.1:5305/ lighthouse-reports/first-frame proto --samples=3 --throttle=simulate,provided
```

Pick a free port with `npm --silent run show:free-port`. The build's post-check fails on the startup
cap; the export is complete by then. The Expo Router measurement used a scratch project outside the
repository: pnpm, `expo@57.0.26` with
`expo install expo-router expo-constants expo-linking react-native-screens`, one `View`, exported
three ways, measured with `harness/router-measure.mjs`.
