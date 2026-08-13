# App-driver tooling

This capability owns the shared Playwright selector and gesture API used by tools that drive the
live Splotch app. The smoke entry point exercises that API against current markup so on-demand asset
generators do not silently rot between manual runs.

## Entry point

| Entry point                 | Public command              | Purpose                                   |
| --------------------------- | --------------------------- | ----------------------------------------- |
| `run-driver-smoke-test.mjs` | `npm run test:driver:smoke` | Exercise the shared live-app driver in CI |

`lib/app-driver.mjs` owns dev-server lifecycle, browser setup, selectors, palette and picker input,
brush and stroke controls, drawing gestures, coloring-book navigation, and settings helpers.
`lib/stroke-geometry.mjs` owns reusable point generation for asset scenes. These are support
modules, not standalone commands.

## Inputs and behavior

The smoke starts or reuses Splotch on `SMOKE_PORT` (4173 by default) and launches Chromium. It
exercises the drawing canvas, drawer, palette, exact picker colors, brush and size selection,
tiled-renderer ink, and coloring-book overlay at the Google Play tablet viewport. It also verifies
that every generated store-drawing scene color remains selectable at all four store target
viewports.

The command needs installed project dependencies and Playwright Chromium. A port may be free or
already serving Splotch; the shared server helper reuses a compatible listener. Any failed smoke
assertion or browser/server error exits nonzero after cleanup and prints the failing checks.

## Ownership and maintenance

Selector and interaction knowledge shared by multiple generators belongs in `lib/app-driver.mjs`.
Capability-specific scene composition, artifact paths, and output dimensions stay with their owners,
such as `marketing-assets/` and `store-drawings/`. Update the smoke whenever a new shared driver
path needs CI coverage, and prefer visibility or committed-state signals over fixed sleeps when the
app exposes one.

Run focused verification with:

```sh
npm run test:driver:smoke
npm run test:tools -- tools/tests/palette-source.test.mjs
```
