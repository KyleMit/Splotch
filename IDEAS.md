# Ideas for Splotch

This is a creative exploration, not a prioritized backlog. The ideas below are grounded in the
current web, native, server, deployment, testing, and asset-generation code. They intentionally
avoid duplicating work already listed in `docs/BACKLOG.md`, `docs/AUDIT.md`, open GitHub issues, and
the asset pipeline's own issue and idea documents.

Each idea is meant to contain enough context for a future Codex session to investigate and refine
it. Significant architecture changes should consult the relevant ADRs and usually create or update
an ADR before implementation.

## 1. Crash-Safe Drawing Recovery

**Brief.** Preserve the one drawing currently in progress across a browser refresh, WebView
eviction, process kill, crash, or dead battery. This is a single emergency draft, distinct from the
multi-drawing gallery already in the backlog.

**Rough implementation.** After each committed stroke, schedule an idle checkpoint containing a
flattened baseline PNG plus the active coloring page, paper orientation, theme, and minimal tool
state. Store it in IndexedDB on web and Capacitor Filesystem on native, then teach
`drawing/undoHistory.ts` and `DrawingCanvas.svelte` to offer or automatically restore it at boot.
Clear or replace the checkpoint only after an intentional new-page action.

## 2. Redo the Last Undo

**Brief.** Let a child reverse an accidental Undo instead of permanently losing the last gesture.
ADR-0033 already calls redo a near-trivial follow-up to the command-replay history.

**Rough implementation.** Retain commands popped by `undoHistory.popCommand()` in a bounded redo
stack, clear that stack when a fresh command commits, and add `redo()` plus `canRedo` to the engine
and `canvasState`. Show a Redo button in `ActionsPanel.svelte` only while it is useful, and exercise
normal strokes, clears, erasers, magic strokes, keyframes, and rotations in the engine harness.

## 3. Masterpiece Time-Lapse

**Brief.** Give parents a replay of how a picture emerged, with an optional short animation export.
The existing replayable op vocabulary is unusually well suited to this.

**Rough implementation.** Record committed commands and relative timestamps in a session timeline
separate from the ten-command undo window, because old undo commands currently fold into a raster
baseline. Replay the timeline through `strokeOps.renderOp()` on an isolated canvas, with speed and
pause controls. Start with an in-app replay; later add WebM or GIF encoding behind the parent-facing
save flow.

## 4. Share a Masterpiece

**Brief.** Add a parent-facing Share action alongside saving, so a finished PNG can go directly to
Messages, AirDrop, email, or another installed app.

**Rough implementation.** Reuse `engine.exportCanvasBlob()` and pass a `File` to
`navigator.share({ files })` where Web Share Level 2 is supported. Use a tree-shaken Capacitor Share
plugin on native and retain `drawing/screenshot.ts`'s gallery, folder, and download paths as
fallbacks. Keep all outbound sharing behind the Parent Center's adult gate and re-check Kids
Category external-action requirements.

## 5. Parent Center Adult Gate

**Brief.** Prevent random toddler taps from changing AI credentials, orientation, save behavior, or
control visibility. Today `ParentHelpButton.svelte` opens every parent setting with one tap.

**Rough implementation.** Add an optional, accessible adult gesture such as a long press followed by
holding two illustrated corners. Keep a keyboard/switch-control alternative and avoid knowledge
questions that exclude some adults. Put the gate in front of `openParentCenter()` and any future
external share/link actions, with the preference stored through `settings.svelte.ts`.

## 6. Gentle Drawing Session Timer

**Brief.** Offer parents a calm 5-, 10-, or 15-minute session boundary instead of an abrupt device
lock. This pairs naturally with the app's wake lock, which can otherwise keep a drawing session
alive indefinitely.

**Rough implementation.** Add a Parent Center duration setting, track foreground time using
`visibilitychange`, and show a subtle final-minute sky or color transition. At the end, save a crash
checkpoint and cover child controls with an “All done for now” scene that only the adult gate can
dismiss. The default remains unlimited.

## 7. One-Tap Control Presets

**Brief.** Make the growing settings list approachable through presets such as “Little Hands,”
“Coloring Time,” “Quiet Time,” and “Everything.”

**Rough implementation.** Define typed preset records over the existing setters in
`state/settings.svelte.ts`. `SettingsToggles.svelte` can apply a preset atomically and show “Custom”
once an individual value diverges. Include control visibility, sound level, button scale, coloring
books, AI, and orientation, but never credentials or saved content.

## 8. Sensory Color and Music Modes

**Brief.** Extend drawing audio beyond pencil scratch: announce color names for pre-readers, add a
small haptic when a swatch changes, or turn drawing into music where hue selects a note family and
vertical position selects pitch.

**Rough implementation.** Expand the engine's sound callback from speed-only data to a typed sensory
event carrying color and position. Add offline voice clips or Web Audio oscillators beside
`audio/drawingSound.ts`, reuse `haptics.ts`, and expose separate Parent Center toggles. Keep the
current pencil loop as the default and respect reduced-motion/quiet presets.

## 9. Recent and Favorite Custom Colors

**Brief.** Turn the custom picker from one remembered hex value into a tiny personal palette for a
child who repeatedly wants “my blue” or “the dinosaur green.”

**Rough implementation.** Persist a deduplicated recent-color ring and a short parent-managed
favorites list in a new color state module. Render the list above the honeycomb in
`ColorPicker.svelte`, and optionally let favorite colors occupy bonus swatch slots when space
allows. Preserve the existing trim priority so core colors never disappear unexpectedly.

## 10. Surprise Me Coloring Page

**Brief.** Add a single tile that selects a random platform-safe coloring page without making a
toddler choose a book and then a page.

**Rough implementation.** Flatten `booksForPlatform()` into eligible pages, avoid the immediately
previous selection, choose the current paper orientation, and preload the overlay/fill before
closing the picker. `state/books.ts` already centralizes platform eligibility and all required asset
paths, so the randomizer should not infer filenames independently.

## 11. Offline “What Should I Draw?” Spinner

**Brief.** Offer lightweight prompts such as “a red balloon,” “a sleepy dinosaur,” or “three wiggly
lines” without calling AI or requiring connectivity.

**Rough implementation.** Ship a small typed prompt deck assembled from existing book thumbnails,
palette labels, and icon assets. Add an optional Actions Panel button that opens a large, visual
prompt card and can speak it through the sensory-audio mode. Keep prompts local, translatable, and
free of scoring so the feature encourages invention rather than evaluating it.

## 12. Coloring Page Completion Celebration

**Brief.** Celebrate effort when a meaningful portion of a coloring page has been painted, without
requiring precise inside-the-lines behavior.

**Rough implementation.** At stroke end, compare a low-resolution fillable-area mask with opaque
canvas coverage using a scratch canvas similar to `drawing/emptyScan.ts`. Trigger broad milestones
only once per page and reuse `AiConfetti.svelte` or a page-character animation. Keep the progress
approximate and private; it should be a delight signal, not a score.

## 13. Mirror and Kaleidoscope Drawing

**Brief.** Add playful symmetry modes that mirror a gesture across one axis, four quadrants, or
radial slices.

**Rough implementation.** Transform each dot/path op into sibling ops in paper coordinates before
both live rendering and history recording. Extending the shared op path means undo, resize,
rotation, export, erasing, and magic brush can inherit the behavior. Add a simple mode state beside
`state/tool.svelte.ts` and start with one vertical mirror before attempting radial geometry.

## 14. Two-Child Duet Canvas

**Brief.** Turn Splotch's unusually strong multi-touch support into a cooperative same-device mode,
with separate colors or tools on the left and right halves.

**Rough implementation.** Add a duet setup surface with two compact palettes. Capture a participant
and style on each pointer-down, which fits the per-pointer state already in `drawing/engine.ts`.
Keep simultaneous fingers as one undo group initially, then test whether separate per-player undo is
worth the added command-boundary complexity.

## 15. Pressure-Sensitive Stylus Strokes

**Brief.** Use Apple Pencil and compatible pen pressure for natural thick-and-thin strokes. The
engine recognizes pen pointers today but uses one fixed width for the whole contact.

**Rough implementation.** Map `PointerEvent.pressure` through a gentle curve around the selected
base width and split path ops when width changes beyond a small threshold. Update simplification so
style boundaries remain intact and add a Parent Center opt-out for predictable thickness. Validate
on real iPad and Android hardware because synthetic browser pressure is not representative.

## 16. Palm Rejection and Stylus-Only Mode

**Brief.** Reduce accidental marks when a child rests a hand on the screen while using a pencil,
without weakening the default multi-finger experience.

**Rough implementation.** Offer an explicit “Pencil only while drawing” setting and, optionally,
ignore unusually broad touch contacts while a pen is active using pointer width/height. Keep the
heuristic disabled by default and instrument it in the `/dev/engine` harness. Avoid blanket touch
suppression, because multi-touch drawing is a deliberate feature.

## 17. Paper Playground

**Brief.** Let children choose warm paper, colored construction paper, chalkboard, graph paper, or a
square postcard instead of coupling paper appearance entirely to light/dark theme.

**Rough implementation.** Create one paper-style descriptor that drives CSS tokens,
`exportDrawing.ts`, texture loading, and optional aspect ratio. Reuse `paperView.ts` for contained
square/portrait/landscape sheets and migrate the current light/dark colors into the descriptor.
Coloring-page compatibility and night fills need explicit validation for every style.

## 18. First-Class AI Access Grants

**Brief.** Replace the server's array of arbitrary plaintext access strings with grants that can be
labeled, expired, paused, and understood in the admin console.

**Rough implementation.** Introduce a versioned record with an internal ID, generated secret hash,
label, creation/expiry dates, status, and optional quota. Migrate current strings on read in
`server/tokens.ts`, reveal new secrets once, and key usage by grant ID. Update both web and native
front doors through the shared `AdminConsole.svelte` contract.

## 19. One-Time Invite Redemption

**Brief.** Stop putting the same reusable generation credential in an invite URL forever. The app
scrubs the query string, but anyone retaining the link retains the secret.

**Rough implementation.** Generate a short-lived, single-use nonce in a separate store. A new
redemption endpoint atomically consumes it and returns a per-device grant, which the client stores
securely before removing the URL parameter. Creating access for another device produces another
invite rather than copying a shared long-lived credential.

## 20. Protect Managed Codes Like BYOK Keys

**Brief.** Managed access codes can spend project quota, yet `settings.svelte.ts` currently keeps
them in plaintext localStorage while Gemini keys and admin sessions use secure storage.

**Rough implementation.** Add a managed-code slot to `secureStorage.ts`, migrate and scrub the
legacy localStorage value during hydration, and hold only the hydrated value in live state. URL
capture should await secure persistence before scrubbing the query parameter so a failed write does
not silently discard the invitation.

## 21. Durable Quotas and Spend Budgets

**Brief.** Convert the current per-function-instance burst guard into real hourly/daily protections
for managed model spend and credential guessing.

**Rough implementation.** Put rate limiting behind an adapter, keep the in-memory implementation for
local development, and use an atomic durable backend for production. Separate short per-IP oracle
limits from per-grant generation budgets, show remaining allowance in admin, and optionally
auto-pause a grant at a hard ceiling. Netlify Blobs CAS may be sufficient at low traffic, but this
needs contention tests before committing to it.

## 22. Expiring, Per-Device Admin Sessions

**Brief.** Every admin login currently receives the same deterministic HMAC; the web cookie lasts
about ten years, and rotating the global secret is the only revocation mechanism.

**Rough implementation.** Issue random session credentials, store only hashes server-side, and
record creation, expiry, last-used time, and a device label. Let an admin revoke one session or all
sessions. Preserve the existing cookie transport on web and bearer transport on native while
replacing the shared deterministic value inside `server/admin.ts`.

## 23. Append-Only Admin Audit Trail

**Brief.** Preserve who changed access, when, through which console, and whether the operation
succeeded. Token removal currently deletes usage and leaves only the new current state.

**Rough implementation.** Write privacy-minimized events to a separate append-only store for logins,
grant creation, pause/revocation, quota changes, persistence fallback, and CAS conflicts. Record a
hashed grant/session ID, timestamp, deploy environment, action, and result. Add a compact
history/export view to the shared admin component.

## 24. Minimize and Expire Usage Records

**Brief.** Usage blobs are keyed by the raw access code and retain `lastPrompt`. The prompt is
server-defined today, but future custom prompts would make that field more sensitive.

**Rough implementation.** Key usage by an HMAC-derived grant ID, store style and outcome categories
instead of complete prompt text, and define a retention window. After revocation, keep only an
aggregate tombstone if operationally useful. Update the privacy page and tests with the exact
retention and deletion behavior.

## 25. Isolate Deploy Preview Data from Production

**Brief.** Deploy previews currently share site-wide Netlify Blobs with production, so preview admin
actions and smoke tests can modify real access data.

**Rough implementation.** Namespace token, usage, audit, and invite stores by deployment
environment, or bind previews to one explicit staging namespace. Seed only test grants there, show
an environment badge in admin, and reject preview origins that attempt to open the production
namespace. Update the Blobs smoke workflow to assert isolation as well as persistence.

## 26. Explicit Native Staging API Builds

**Brief.** Native development builds call `https://splotch.art` because `__NATIVE_API_BASE__` is
hard-coded, so testing AI or native admin can touch production.

**Rough implementation.** Accept a validated build-time API base with production as the release
default, add clearly named staging build/sync scripts, and render an unmistakable staging marker in
debug admin surfaces. A release verification step should fail if a shipping bundle points anywhere
except production. Keep the selection compile-time in line with ADR-0010.

## 27. Privacy-Safe Operations Dashboard

**Brief.** Bring build version, storage health, request latency, refusal/error rates, and provider
status into one operator view without adding child analytics.

**Rough implementation.** Attach a request ID and structured fields to API logs, recording route,
build, latency, status category, and provider outcome—but never drawings, prompts, keys, or raw
tokens. Add an admin-only diagnostics snapshot backed by small aggregates and configuration
booleans. Keep product usage analytics explicitly out of scope.

## 28. Scheduled AI Safety Drift Canary

**Brief.** Provider behavior can change without a code deploy, while the encrypted red-team suite is
currently manual. A small recurring canary could reveal a safety regression earlier.

**Rough implementation.** Select a tiny budget-capped safe/block subset, run it weekly or through a
manually approved scheduled workflow against staging, compare expected allow/refuse categories, and
publish a private summary artifact. Keep the full sensitive corpus manual and require explicit
secret/cost approval before enabling the schedule.

## 29. Deliberate AI Model Canary and Failover

**Brief.** The provider seam reduces migration effort, but one hard-coded active model still makes
an outage or retirement urgent.

**Rough implementation.** Extend `server/ai/provider.ts` with configuration-selected adapters or
model revisions and route a small, stable canary percentage to a candidate. Compare latency,
refusal, error, and reviewed quality. Fail over only on genuine upstream errors—not safety
refusals—and define how BYOK behaves if a fallback cannot accept a Gemini key. Record the final
policy in an ADR.

## 30. Versioned API Capabilities for Old Native Apps

**Brief.** Installed native releases can outlive several hosted API revisions, but requests carry no
client contract version and the server exposes no capability negotiation.

**Rough implementation.** Add a small client wrapper around `apiUrl()` that sends app version,
platform, and API version headers. Publish a capability/compatibility response and define a support
window before changing response shapes. An unsupported client can hide AI or show a parent-facing
update message instead of falling into a generic error.

## 31. Content Security and Capability-Limiting Headers

**Brief.** Deployment currently sends frame, MIME-sniffing, and referrer protections but no Content
Security Policy or Permissions Policy.

**Rough implementation.** Start with report-only CSP, accounting for SvelteKit inline boot code,
blob image previews, fonts, and the hosted API. Move to nonces/hashes once reports are clean. Add a
restrictive Permissions Policy for unused camera, microphone, geolocation, and payment features;
consider HSTS only after confirming every relevant hostname is permanently HTTPS.

## 32. Full Hosted Deploy Contract Check

**Brief.** The deployment workflow proves Blobs persistence but not static routes, CORS, cache and
security headers, version freshness, or the broader API auth contract.

**Rough implementation.** Add a remote mode to `scripts/api-smoke.mjs` and check `/`, `/privacy`,
`version.json`, both Capacitor-origin preflights, unauthenticated response shapes, headers, and an
admin persistence round-trip without making a paid model call. Run it after preview and production
deploys and on a modest production schedule.

## 33. Test the PWA as an Offline Product

**Brief.** The E2E suite builds the service worker but does not prove offline navigation, critical
asset caching, or the drawing-preserving update lifecycle.

**Rough implementation.** Build a production-only Playwright harness that waits for service-worker
control, reloads offline, opens core drawing/coloring features, then stages a second build. Verify
the update waits while ink exists and activates on a blank canvas. A purpose-built two-build harness
will likely be more reliable than ordinary test-server reuse.

## 34. Build the Native Static Target on Every Pull Request

**Brief.** Normal CI exercises only the Netlify adapter; native smoke runs after a release tag. A
change can break `CAPACITOR=true`, prerendering, or asset stripping much earlier.

**Rough implementation.** Add the relatively cheap `npm run build:cap` to pull-request CI and assert
that `200.html` exists, mobile coloring assets exist, web-only/server/dev routes are absent, and no
secret/env file was emitted. Keep emulator and simulator jobs tag-only unless their cost becomes
justified.

## 35. Pre-Tag Release Candidate Gate

**Brief.** `scripts/release.mjs` commits, tags, and pushes before the tag-triggered native smoke
workflows run, so a bad native release is discovered after the release already exists.

**Rough implementation.** Add `release:verify` to run quality checks, all local tests, web and
native builds, asset gates, version parity, and native smoke where the host supports it. Require a
fresh successful verification receipt before the release script may tag, while retaining an explicit
reviewed escape hatch for unavailable native toolchains.

## 36. Verify Final Release Artifact Freshness and Contents

**Brief.** The release script can attach any existing AAB without proving it matches the new
version, and source-tree checks do not inspect the APK/AAB/IPA that users receive.

**Rough implementation.** Have each release build emit a manifest containing version name/code,
commit SHA, build time, and SHA-256. Refuse stale attachments. Inspect final archives for required
pages/assets, forbidden server routes, source maps, env files, permissions, and size budgets, then
upload a readable package inventory as a CI artifact.

## 37. Exercise Native Release Configurations

**Brief.** Current native smoke workflows use debug builds, missing Android R8/resource-shrinking
failures and iOS Release-only compiler/config differences.

**Rough implementation.** Build an unsigned or test-signed Android release artifact and run it
through `bundletool` or an installable release APK. Compile an iOS Release simulator app without
store signing. Keep real signing material local, but ensure production optimization and resource
rules compile before a tag is considered healthy.

## 38. Scheduled Native Support-Floor Matrix

**Brief.** Splotch promises Android API 24 and iOS 16.4, while CI tests Android API 33 and the
newest installed iPhone runtime.

**Rough implementation.** Add a weekly/manual matrix covering oldest-supported and current runtimes,
phone and tablet viewports, and both orientations. Reuse the existing Maestro flow and keep the
matrix out of ordinary PRs. Make failure reports identify OS, device, WebView/runtime, and
orientation so compatibility drift is actionable.

## 39. Native Capability Journey Tests

**Brief.** A native app can boot while offline behavior or a registered plugin is broken; current
Maestro coverage mostly proves first paint and the static admin route.

**Rough implementation.** Add a development-only diagnostics route and Maestro journeys that toggle
offline state, draw and undo with a bundled page, verify the AI control disappears, and call
DeviceLock, PencilEraser subscription, Preferences, secure storage, orientation, haptics, and media
registration. Assert native implementations respond rather than silently taking web fallbacks.

## 40. Cross-Browser E2E Matrix

**Brief.** The compatibility floor includes Firefox and Safari/iOS, but the regular Playwright suite
runs Chromium only. Several existing workarounds are specifically for WebKit.

**Rough implementation.** Define a smaller engine/UI contract suite that runs under Chromium,
Firefox, and WebKit on every PR, while keeping expensive or Chromium-specific specs in their current
project. Cover drawing, modal gestures, palette selection, theme, export, and PWA-adjacent
navigation. Preserve real-device tests for Apple Pencil and WebView-only behavior.

## 41. Visual Regression Matrix

**Brief.** Many layout risks live at combinations of phone/tablet, portrait/landscape, light/dark,
safe-area insets, open drawers, and modal states that behavioral assertions do not catch.

**Rough implementation.** Add deterministic screenshot fixtures for the main canvas, Actions Panel,
color picker, coloring books, Parent Center tabs, AI states, and admin. Mask genuinely dynamic
regions and review baselines through the existing artifact publishing workflow. Start with high-risk
small viewports rather than snapshotting every pixel permutation.

## 42. Bundle and Performance Budgets in CI

**Brief.** Splotch has strong profiling tools but no automatic guard against entry-chunk growth, new
long tasks, or a large native package.

**Rough implementation.** Record reviewed budgets for initial JS/CSS/font bytes, largest lazy chunk,
PWA precache size, native archive size, and a small set of stable `perf:mount`/engine metrics. Run
cheap size checks on PRs and scheduled performance captures for noisier timing data. Report trends
before making timing thresholds blocking.

## 43. Modular Downloadable Coloring Packs

**Brief.** Coloring assets dominate `web/static` and every current catalog ships inside native.
Future books will keep increasing install, update, and PWA cache size.

**Rough implementation.** Keep a generous starter set bundled for the fully offline promise, then
publish additional packs behind a signed/versioned manifest. Cache packs with Cache Storage on web
and Capacitor Filesystem on native, with parent-controlled download/delete and clear storage
estimates. `state/books.ts` should consume one catalog model for bundled and installed packs.

## 44. Versioned Settings Schema and Safe Import/Export

**Brief.** Settings are many independent storage keys with ad hoc legacy migration. A schema would
make future renames, device moves, bug reports, and resets safer.

**Rough implementation.** Define a versioned, validated settings document and explicit migrations,
while retaining synchronous boot reads if measurements require them. Add parent-facing export,
import, and reset actions that exclude AI keys, access codes, admin sessions, drawings, and folder
handles. Test upgrades from every supported schema version and corrupt/partial documents.

## 45. Localization and RTL Readiness

**Brief.** UI labels, setup instructions, privacy copy, book names, release notes, and store copy
are English-only and mostly embedded directly in components.

**Rough implementation.** Introduce a typed message catalog with a small first translation, move
book/prompt display names to message keys, and read the platform/browser locale with a Parent Center
override. Add pseudo-localization and RTL screenshot tests early so fixed widths, tab paging,
gestures, and palette orientation do not harden around English assumptions.

## 46. Machine-Checkable Privacy and Permission Inventory

**Brief.** Store privacy claims, Android permissions, iOS usage strings, plugin dependencies, and
outbound hosts currently live in separate files that can drift—especially risky for a kids app.

**Rough implementation.** Create one reviewed inventory of permissions, data categories, purposes,
retention, SDKs, and hosts. Generate or verify store declarations, Android manifest entries, iOS
usage descriptions/privacy manifests, and privacy-page facts from it. Fail CI when a dependency or
native change adds an undeclared capability.

## 47. Toolchain Manifest and `npm run doctor`

**Brief.** Node, JDK, Android, Xcode, Maestro, Netlify, and signing requirements are scattered, and
the repository does not pin a Node version in `package.json` or a standard version file.

**Rough implementation.** Add `engines`, a checked-in Node version file, and a cross-platform Node
doctor that reports Node/npm, JDK/JAVA_HOME, Android SDK/build tools, Xcode/runtime, Maestro,
Netlify CLI, signing-file presence, and version-floor consistency without printing secrets. Link all
setup docs to the doctor rather than duplicating detection logic.

## 48. Asset Provenance and Derived-Asset Freshness

**Brief.** Accepted AI art lacks a durable receipt tying it to model, prompt revision, inputs,
attempts, gates, and cost; deterministic manifests also do not prove every thumbnail/punch was
rebuilt from current sources.

**Rough implementation.** Have `tools/asset-gen` generators write resumable run ledgers with input
hashes, model/config, gate scores, request count, and accepted candidate. Add request/cost ceilings.
For deterministic punches and thumbnails, regenerate into a temporary directory in `--check` mode
and byte-compare outputs, or store explicit source-hash-to-derived-hash relationships in the asset
manifest.

## 49. Privacy-Safe Parent Diagnostics Bundle

**Brief.** Splotch deliberately has no analytics or crash SDK, which is excellent for privacy but
makes remote troubleshooting depend on verbal descriptions.

**Rough implementation.** Add an adult-gated About/Diagnostics view showing app version/build,
platform and WebView version, online state, storage availability, plugin health, asset/catalog
version, and a short ring of local error codes. Provide copy/export after filtering drawings,
prompts, tokens, keys, file paths, and other identifying data. Make collection local and opt-in.
