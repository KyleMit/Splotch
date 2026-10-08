# Web migration contract

**Status:** Draft acceptance contract; replacement validation is pending. Linked code and tests
describe the shipping implementation's obligations, not evidence that a replacement meets them.

The [authoritative fresh-start scope](CONTRACT.md#authoritative-fresh-start-scope) retires legacy
beta settings/data import and exact old-UI layout/flow parity. Named old controls and settings below
are reference implementations of the applicable startup, safe-drawing, accessibility and lifecycle
risks, not required UI arrangements. The selected new-product inventory owns its concrete flows;
substantive capabilities and web/security/hosted contracts remain required.

The shared product UI is a candidate architecture. React Native Web and React Strict DOM must prove
the browser contracts below before the foundation choice becomes final. Web cutover has its own
gate, independent of native cutover or native performance gains.

## Retained hosted boundaries

Keep SvelteKit and Netlify serving the hosted API, admin console, feedback server actions,
informational pages, and public enrollment routes during the product UI migration. Rewriting these
surfaces does not establish a mobile rendering benefit and increases the simultaneous migration
surface. The drawing route remains a static, CDN-served document unless a reviewed decision replaces
that contract with measured equivalent behavior.

After product cutover, retained Svelte/SvelteKit code still owns those hosted routes and server
contracts. The architecture check chooses whether the shared product UI is embedded in a SvelteKit
route or served by a separate build on the same origin. Record the remaining module and runtime
responsibilities for that choice: an embedded route retains a scoped host shell; a separate build
owns its product document and integrates with the retained hosted routes. Retire the duplicated
Svelte product implementation rather than treating all retained hosting code as obsolete.

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

Keep retained engine-owned paper and its layered topology outside React roots by default. An
unrelated hydration mismatch must actually trigger React recovery while the paper's input/tile node
identities, accepted pixels and history survive. If an alternative ownership boundary is proposed,
it must prove the same recovery behavior before adoption.

Evidence: [early boot](../../web/src/lib/drawing/earlyBoot.ts),
[adoption guard](../../web/tests/early-boot.spec.ts), and
[ADR-0072](../adrs/0072-early-engine-boot-adopt-contract.md).

### Correct first paint

Portrait and landscape geometry and the new product's theme, controls and persisted appearance paint
correctly before hydration. Defaults remain safe when storage is unavailable. Hydration must not
introduce a visible settings correction or replace accepted ink. Above-floor paint enhancements
retain their documented fallback behavior.

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

Preserve installed PWA identity, app-shell recovery, starter content, new-product installed
downloadable books, responsive-image canonical fallback, and cached informational pages. Legacy
books/cache/settings transfer is retired; safe shell/update recovery remains required. First-visit
service worker registration waits for the stroke and idle gates; repeat visits can resume
interrupted installation without requiring new strokes. Native artifact caching remains a separate
concern.

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
refreshes, and return navigation leave no stray history layers. Preserve the drawing guard in
standalone display mode or coarse-pointer browsers, including iPhone and iPad Safari touch tabs.
Include an iOS-Safari-shaped coarse-pointer scenario: Back closes the dialog, consumes the drawing
guard once, then resumes ordinary navigation. Fine-pointer tabs outside standalone mode retain
normal navigation.

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

1. Begin with a vocabulary-neutral realistic host/history/worker proof and retained paper. The
   embedded SvelteKit host is the lower-change first check, not a final host verdict; investigate a
   separate same-origin product document when a required contract or measured retained-runtime cost
   warrants it. Then render representative shared controls/dialogs through each viable web
   vocabulary in that host, proving prerendering, CSP, seeds, canvas ownership and browser history
   on Safari and Chromium.
2. Exercise every surviving UI arm in its chosen realistic host: embedded in the retained SvelteKit
   route, or a separate product build deployed with the retained routes on the same origin. A
   standalone harness pass is insufficient. Prove prerendering and hash/nonce CSP, pre-paint seeds
   through route transitions, one browser history coordinator, and one service worker
   registration/activation owner covering the deployed assets and navigation scope. Verify matching
   shell/chunk precaches, app-shell fallback, active-ink-safe updates, and admin cache bypass across
   that host boundary. Measure the full startup graph, including any retained Svelte runtime,
   against the budget owners; identify which Svelte modules remain responsible after cutover.
   Document the host choice and demonstrated costs before selecting the foundation.
3. Inventory necessary web adapters for HTML semantics, CSS media queries/variables, dialog focus,
   text enlargement, and PWA lifecycle. Judge their recurring maintenance cost against the intended
   shared UI benefit; visual similarity alone is insufficient.
4. Separate portable behavior from browser rendering. The
   [engine facade](../../web/src/lib/drawing/engine.ts) imports SvelteKit and rune state and owns
   DOM/Canvas2D objects; its imperative API does not make it a drop-in native module. Keep its tuned
   renderer behind an explicit web adapter.
5. Demonstrate build boundaries: native dependencies absent from web startup, server modules absent
   from clients, correct deploy watched paths, compatible asset staging, and profiling markers
   stripped from release artifacts. Preserve deliberate token startup boundaries documented in
   [ADR-0071](../adrs/0071-design-token-single-source.md).

Begin with portable contracts and a separate candidate entry while the shipping application stays
runnable. Port integrated areas in reviewable slices with one owner for each setting and DOM
subtree. Web replacement remains pending until these structural proofs and the complete, tuned
application's applicable product acceptance and performance evidence pass.
