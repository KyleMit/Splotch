<!-- Source: .ruler/AGENTS.md -->

# tools/store-drawings/ — store screenshot drawing pipeline

This folder is the self-contained offline pipeline that compiles authored SVG samples into static
pointer instructions and evaluates their replay through the production Splotch canvas.

* Runnable entry points live in `bin/`; shared replay helpers live in `lib/`.
* `samples/` contains the temporary centerline SVG authoring inputs. Runtime and store screenshots
  never load them.
* `generated/store-drawings.mjs` is machine-authored by `npm run gen:store-drawings`; never edit it
  directly. `npm run gen:store-drawings:check` guards drift.
* Node-environment unit tests live in `tests/` and run through `npm run test:store-drawings` using
  this folder's `vitest.config.mjs`.
* The browser-driving entries deliberately reuse `scripts/lib/app-driver.mjs`, the shared production
  UI/pointer driver also covered by `npm run test:driver:smoke`.
* Read `README.md` for conversion constraints, fidelity evaluation, and review-capture workflows.
