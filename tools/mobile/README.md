# Mobile tooling

This capability owns repository automation shared by Splotch's Android and iOS apps: native app
identity checks, Capacitor static-export pruning and validation, and the Maestro smoke-test support
used by both platform runners. Platform-specific build and lifecycle entry points live under
[`android/`](android/) and [`ios/`](ios/).

## Entry points

| Entry point               | Public hook     | Purpose                                                                                                                  |
| ------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `check-app-ids.mjs`       | `precheck`      | Verify app identifiers and display names across native owners                                                            |
| `strip-static-assets.mjs` | `build:cap`     | Remove web-only assets from the static Capacitor export                                                                  |
| `check-static-bundle.mjs` | `postbuild:cap` | Reject web-only routes, services, or assets in that export, and require the store-mandated pages to ship *and* be linked |

The build entry points read `capacitor.config.json`, native project configuration, active mobile
documentation, and `web/build/`. Pruning changes only the freshly generated `web/build/` output; it
never edits `web/static/`. The checker requires the bundled privacy and changelog pages, permits
only the starter coloring book, and fails if web-only hosts, admin copy, or PWA boot markers remain.

## Shared support

`lib/static-export.mjs` owns the web-only static-file catalog and matching head-tag rewrite.
`lib/maestro.mjs` resolves the Maestro executable, while `lib/mobile-smoke-test.mjs` runs the shared
`.maestro/smoke.yaml` flow after a platform runner builds and installs the app. These modules are
support code, not standalone commands.

Mobile builds require the normal project dependencies. Static pruning and checking require a fresh
Capacitor build; a missing or inconsistent export exits nonzero with the affected path or marker.
Keep cross-platform policy here, Android SDK/Gradle concerns under `android/`, and Xcode/simulator
concerns under `ios/`. When native identity, excluded routes, or static assets change, update their
owning source and the corresponding drift guard rather than duplicating another literal.

Focused repository checks:

```sh
npm run test:tools -- tools/mobile
npm run check
```
