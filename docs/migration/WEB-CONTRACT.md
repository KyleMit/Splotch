# Web migration contract

**Status:** Draft acceptance contract; replacement validation is pending. Linked code and tests
describe the shipping implementation's obligations, not evidence that a replacement meets them.

The shared product UI is a candidate architecture. React Native Web and React Strict DOM must prove
the browser contracts below before the foundation choice becomes final. Web cutover has its own
gate, independent of native cutover or native performance gains.

## Retained hosted boundaries

Keep SvelteKit and Netlify serving the hosted API, admin console, feedback server actions,
informational pages, and public enrollment routes during the product UI migration. Rewriting these
surfaces does not establish a mobile rendering benefit and increases the simultaneous migration
surface. The drawing route remains a static, CDN-served document unless a reviewed decision replaces
that contract with measured equivalent behavior.

The API must continue serving installed clients, including older Capacitor builds. Preserve the
[wire contracts](../API.md), [API headers](../../web/src/lib/apiHeaders.ts),
[CORS and cache hooks](../../web/src/hooks.server.ts), and legacy trusted origins in
[SvelteKit configuration](../../web/svelte.config.js). Browser admin cookie/form actions and admin
API bearer sessions remain distinct contracts.

Owners: [ADR-0001](../adrs/0001-sveltekit-dual-adapter-strategy.md),
[ADR-0040](../adrs/0040-per-route-render-modes-and-ssg-home.md),
[production deploy configuration](../../netlify.toml), and
[route render-mode guards](../../web/src/routes/perRequestRoutes.webSsr.test.ts).

## Named acceptance checks

### First usable drawing

The browser receives paper and controls before application hydration completes. Input becomes usable
without waiting for every control and overlay to mount. Ink accepted before hydration survives the
handoff, and the hydrated UI receives the engine's current state. When retaining the Canvas2D
surface, hydration adopts the same owned canvas and complete layered topology.

Evidence: [early boot](../../web/src/lib/drawing/earlyBoot.ts),
[adoption guard](../../web/tests/early-boot.spec.ts), and
[ADR-0072](../adrs/0072-early-engine-boot-adopt-contract.md).

### Correct first paint

Portrait and landscape geometry, persisted theme, toolbar style, drawer visibility, enabled
controls, and button scale paint correctly before hydration. Defaults remain safe when storage is
unavailable. Hydration must not introduce a visible settings correction or replace accepted ink.
Above-floor paint enhancements retain their documented fallback behavior.

Evidence: [pre-paint seed](../../web/src/app.html),
[first-paint checks](../../web/tests/first-paint.spec.ts), and
[ADR-0176](../adrs/0176-drawing-route-holds-first-paint-until-the-toolbar-is-parsed.md).

### Bounded startup work

Keep export/save code, coloring-pack I/O, deferred icons, and hidden-overlay styles off the critical
startup path. Catch the one-shot install event eagerly. A replacement build must expose equivalent
measurable startup and lazy-chunk budgets; changing the bundler is not permission to remove the
guards. Review any replacement budget against equivalent first and repeat visits.

Owners: [budget constants](../../tools/check-bundle-budgets.mjs),
[startup markers](../../web/tests/startup-bundle.spec.ts), and
[overlay scheduling decision](../adrs/0049-idle-mount-boot-hidden-overlays.md).

### Offline content and installation

Preserve installed PWA identity, app-shell recovery, starter content, installed downloadable books,
responsive-image canonical fallback, and cached informational pages. First-visit service worker
registration waits for the stroke and idle gates; repeat visits can resume interrupted installation
without requiring new strokes. Native artifact caching remains a separate concern.

Evidence: [PWA build configuration](../../web/vite.config.ts),
[app-shell route](../../web/src/lib/pwa/appShellRoute.ts), and
[registration/offline scenarios](../../web/tests/pwa-registration.spec.ts).

### Active-ink-safe updates

Worker activation and document reload never discard an active drawing. Recheck ink when an
asynchronous activation completes, including background/foreground transitions and ink appearing
after activation began. Recover a failed or stalled activation without leaving updates disabled.

Evidence: [update lifecycle](../../web/src/lib/pwa/updates.ts),
[activation checks](../../web/src/lib/pwa/updates.activation.test.ts), and
[ADR-0022](../adrs/0022-pwa-service-worker-strategy.md).

### Enforced security and uncached admin

Preserve hash-authorized scripts on prerendered documents, nonce policies on SSR documents, and
response-delivered directives that CSP meta tags cannot express. A UI dependency must not require
loosening script policy. Preserve first-party reporting and server-only dependency exclusion. Admin
documents must bypass Cache Storage and remove older cached copies; HTTP `no-store` alone does not
enforce this. Keep API responses subject to their existing header and cache contracts.

Evidence: [policy owner](../../web/securityPolicy.ts), [CSP checks](../../web/tests/csp.spec.ts),
[SSR headers](../../web/src/hooks.server.ts), and
[admin cache handler](../../web/src/lib/pwa/adminRoute.ts).

### Browser Back and dialog lifecycle

Back closes the top dialog before ordinary navigation. Repeated openings, explicit closes, unmounts,
refreshes, and return navigation leave no stray history layers. Preserve the Android browser and
standalone-PWA drawing guard while ordinary desktop tabs retain normal navigation.

Evidence: [history owner](../../web/src/lib/boot/webBackHandler.ts),
[dialog dismissal](../../web/src/lib/boot/dialogBack.ts), and
[browser Back scenarios](../../web/tests/web-back.spec.ts).

### Accessible adult surfaces and supported browsers

Preserve named dialogs, keyboard operation, parent gating, text contrast in both themes, responsive
Settings navigation, reduced motion, and adult reading enlargement. Do not silently raise the
browser floor through generated CSS, syntax, or dependencies. Current cross-engine CI checks engine
families; it does not prove operation on every declared historical floor version.

Owners: [browser targets](../../web/browserTargets.ts),
[compatibility register](../COMPATIBILITY.md), [accessibility checks](../../web/tests/a11y.spec.ts),
and [test-tier boundaries](../TESTING.md).

## Structural proofs before foundation selection

1. Render a representative shared control/dialog and retained drawing surface through each viable
   web vocabulary. Prove prerendering, CSP compatibility, theme seeding, canvas ownership, and
   browser history on Safari and Chromium before extrapolating from native primitives.
2. Inventory necessary web adapters for HTML semantics, CSS media queries/variables, dialog focus,
   text enlargement, and PWA lifecycle. Judge their recurring maintenance cost against the intended
   shared UI benefit; visual similarity alone is insufficient.
3. Separate portable behavior from browser rendering. The
   [engine facade](../../web/src/lib/drawing/engine.ts) imports SvelteKit and rune state and owns
   DOM/Canvas2D objects; its imperative API does not make it a drop-in native module. Keep its tuned
   renderer behind an explicit web adapter.
4. Demonstrate build boundaries: native dependencies absent from web startup, server modules absent
   from clients, correct deploy watched paths, compatible asset staging, and profiling markers
   stripped from release artifacts. Preserve deliberate token startup boundaries documented in
   [ADR-0071](../adrs/0071-design-token-single-source.md).

Begin with portable contracts and a separate candidate entry while the shipping application stays
runnable. Port integrated areas in reviewable slices with one owner for each setting and DOM
subtree. Web replacement remains pending until these structural proofs and the complete, tuned
application's parity and performance evidence pass.
