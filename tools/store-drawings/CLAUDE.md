<!-- Source: .ruler/AGENTS.md -->

# tools/store-drawings/ — offline drawing scene data

This folder compiles authored SVG samples into deterministic static scene data. It retains pure
geometry, scribble construction, and color-fidelity helpers; it has no live application driver.

* The converter entry point lives at the capability root; pure helpers live in `lib/`.
* `samples/` contains committed centerline SVG inputs used by the offline converter.
* `generated/store-drawings.mjs` exports `STORE_DRAWING_SCENES` and is machine-authored by
  `npm run gen:store-drawings`; never edit it directly. `npm run gen:store-drawings:check` guards
  drift.
* Node tests live in `tests/` and run through `npm run test:store-drawings` using the local
  `vitest.config.mjs`.
* Conversion does not update application captures. The marketing renderer reads the committed
  `store-assets/captures/` images separately.
* Read `README.md` for the retained conversion policy. `DESIGN.md` records the former live capture
  pipeline's rationale and tradeoffs.
