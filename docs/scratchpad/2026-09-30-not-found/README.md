# Friendly not-found verification

Issue 2565 uses `NotFoundPage` only for a route status of 404. The error boundary and other 400,
403, and 5xx responses retain `ErrorScreen`. A web request preserves its 404 HTTP status; native
unknown paths begin at the static adapter's 200.html fallback and resolve the friendly page on the
client. The loaded friendly page displays its noindex title/head without an alert or social image.

## Startup decision

Kit loads its root error entry on every drawing boot, including resources absent from the HTML
modulepreloads. Round one's eager full PageShell import pulled the deferred icon registry and native
dialog owners into that path despite passing the 40 web / 28 native preload pins. The reviewer's
causal finding was confirmed and fixed; `eager-error-heavy-negative.txt` captures the new release
guard rejecting that actual compiled round-one graph while its preload pins pass.

The shared PageShell remains the visual owner. The existing `CAPACITOR=true` build signal selects
three entries through `standalonePageEntries.ts`: synchronous web 404 versus a native-only deferred
404 component, two canonical finite page glyph providers, and the original native PageShell gate
controller versus a web shim. The web glyph provider embeds only the same two first-party SVGs; the
native provider keeps the original deferred registry. Native pending or failed page-chunk loading
displays the existing ErrorScreen with its usable Start over action. A failed local chunk stays on
that recovery screen until navigation/reload, rather than leaving a blank page. Web SSR never uses
asynchronous rendering.

The existing font warmer has its own startup entry and a deliberately duplicated family identity on
both targets. Sharing that import adds a preload chunk; its literal is drift-guarded against the
canonical font owner and installed CSS. Its idle scheduling, input quiet, Save-Data policy and
cancellation remain unchanged. The native gate warm call moved behind its existing controller,
retaining the same on-mount timing and returned cancellation owner.

Exact-base production builds use 3834555ecb598065df57c5f8716bde5a0e1e6faf. Both compared browser
contexts suppress requestIdleCallback callbacks, navigate cold to `/`, wait for the drawing canvas
and capture another 1.5 seconds. This controls scheduled idle warming; observed requests include
other immediate drawing owners as well as the root error loader, so the entire network difference is
not attributed solely to 404. Raw and independently gzipped resource totals are recorded in
`web-startup-cost.json` and `native-startup-cost.json`.

| Compared cost                             | Web delta                                     | Native delta                            |
| ----------------------------------------- | --------------------------------------------- | --------------------------------------- |
| HTML-linked plus eager-error JS/CSS union | 16 resources / 25,610 raw / 10,384 gzip bytes | 1 resource / 1,980 raw / 902 gzip bytes |
| Eager-error JavaScript outside HTML links | 9 resources / 11,608 raw / 5,872 gzip bytes   | Deferred friendly page remains absent   |
| Actual cold drawing JS/CSS requests       | 13 requests / 25,173 raw / 10,074 gzip bytes  | 1 request / 1,980 raw / 894 gzip bytes  |

The remaining web cost is a deliberate consequence of rendering the shared friendly shell in
synchronous SSR. It is presented explicitly for the second rival review. The existing preload pins
remain 40/28. The new guard excludes deferred icons/dialog owners from the error closure and checks
the web linked/error union, including inline CSS, against the existing exported 525KB startup owner.
No budget or protection is relaxed; native retains the total-export budget.

## Native fallback

Run from the repository root, sequentially after the native build:

```sh
npm run build:cap
node --experimental-strip-types docs/scratchpad/2026-09-30-not-found/native-fallback.mjs
```

The harness owns localhost:5301 and closes its server/browser in `finally`. It serves unknown
extensionless paths from the actual `web/build/200.html`, rather than serving a prerendered known
page. Both 320px themes recover through Privacy and Start drawing, restore Privacy's current footer
state, remove noindex on a valid page, and paint real stroke pixels. The input canvas has the tiled
engine's intentional 1×1 backing, so pixel verification composites its visible tiles.
`native-records.json` records geometry and zero page errors. This is a compiled browser check, with
no claim about physical devices or signed shells.

This check exposed Kit's runtime `from.url:null` despite its non-null declared URL type. The shared
BackLink accepts that cold arrival; the mounted callback regression deliberately sends the observed
raw framework payload through `Reflect.apply` rather than asserting a false typed fixture. The
expected client 404 console diagnostics remain in the log; no unhandled page error remains.

## Negative controls

Each source mutation below was restored in `finally`. The captured failing assertions are in
`controls/`; passing implementations are covered by the unit and browser tiers.

| Mutation                                       | Failure                                         |
| ---------------------------------------------- | ----------------------------------------------- |
| Remove BackLink's optional URL hop             | Actual mounted callback throws on null pathname |
| Change the startup warm-font family            | Drift guard receives the wrong family           |
| Remove the footer's error guard                | Missing prefixed paths acquire a current marker |
| Expand friendly rendering to all 400+ statuses | Non-404 SSR assertions lose ErrorScreen         |

| Compile the reviewed eager full shell graph | Release closure guard rejects deferredIcons | |
Force page SVGs to 300×150px | Visible browser guard receives150px height instead of24px |

Browser coverage also pins the true 404 response, title/noindex/noalert, recovery destinations, the
320px primary-only first row and two wash links second row after fonts are ready, and the 80px/56px
fixed-tilt mark. The render-time crash test retains the original Start over recovery.

## Review fixes and native recovery

The footer derives its current marker from the actual `page.error`, so failed feedback form
responses (400, 429 and 502) retain their current marker while prefixed missing paths keep recovery
links. The short 404 introduction stays visible after hydration. The glyph browser guard covers both
variants, themes and forced colors, including exact 24px/9px/12px SVG bounds.

`native-recovery.mjs` runs against the compiled static export and manifest. For a frozen export, set
`SPLOTCH_NATIVE_EXPORT_DIR` and `SPLOTCH_NATIVE_MANIFEST` to its associated build and manifest. It
owns localhost:5301, delays or aborts the actual 404 chunk, checks existing fallback recovery, and
exercises cold feedback gates, one gate host, the original destination, Manage's single Settings
host and close focus, and Never/session original trusted-click popup paths. Its recorded successful
run is `native-remedy-probes.json`; this is browser execution of the native export, without
physical-device or signed-shell claims.

## Final local validation

The complete host-exclusive `SPLOTCH_E2E_PORT=5300 npm test` exited 0: 4,346 app tests, 41 web SSR
checks, 277 asset tests, 23 store tests, 6,641 tool tests and 1,061 browser checks passed. The
browser suite used its normal five-worker capacity and included the existing cross-engine smoke
checks. Quality passed all 14 checks. Production builds retain 40/28 preload pins, and the
eager-error closure/union guard passes. Only local browser/static-export execution is claimed.
