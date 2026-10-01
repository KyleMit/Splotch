# Friendly not-found verification

Issue 2565 uses `NotFoundPage` only for a route status of 404. The error boundary and other 400,
403, and 5xx responses retain `ErrorScreen`. A web request preserves its 404 HTTP status; native
unknown paths begin at the static adapter's 200.html fallback and resolve the friendly page on the
client. Both display the noindex title/head without an alert or social image.

## Startup decision

The exact base 3834555ecb598065df57c5f8716bde5a0e1e6faf builds with 40 web and 28 native drawing
modulepreloads. The first eager error-page import kept web 40 but repartitioned native into 29.
Making the idle dependency lazy, the native error component lazy, or aliasing the error entry did
not recover 28. Those trials were discarded.

Separating the existing font warmer from the pure font identity, with a build-time native literal at
that startup boundary, restores 40/28. The warmer retains its existing shared idle owner,
input-quiet policy, cancellation, and Save-Data behavior. `fonts.test.ts` guards the deliberately
duplicated native family against the canonical value and installed CSS. ADR0032 records this
constraint; no async SSR or bundle cap changes were made.

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
| Change the native warm-font family             | Drift guard receives the wrong family           |
| Remove the footer's successful-status guard    | Missing prefixed paths acquire a current marker |
| Expand friendly rendering to all 400+ statuses | Non-404 SSR assertions lose ErrorScreen         |

Browser coverage also pins the true 404 response, title/noindex/noalert, recovery destinations, the
320px primary-only first row and two wash links second row after fonts are ready, and the 80px/56px
fixed-tilt mark. The render-time crash test retains the original Start over recovery.
