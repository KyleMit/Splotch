# Splotch – Architecture

## Tech Stack

Splotch is one Expo / React Native / React Strict DOM app for Android, iOS and web (ADR-0182). The
application and its native projects live at the repository root. Framework-free app modules live
under `src/lib`; the Netlify API implementation lives under `netlify/server`.

* **React Native and Expo** own the native application, native modules and Metro builds.
* **React Strict DOM (RSD)** supplies the shared controls and layout. Platform implementations
  resolve by file extension, including `.web.ts` and `.native.ts` (ADR-0179).
* **Skia** draws native ink (ADR-0178). The browser has its own drawing implementation; a platform
  adapter is a build boundary, not a runtime Capacitor check.
* **TypeScript** supplies strict contracts across the app, server and tools.
* **Netlify** serves the static web export and `netlify/functions/api.ts`. Background generation and
  scheduled retention functions remain separate (ADR-0115).
* **OpenAI** runs only behind the server's provider interface in `netlify/server/ai/` (ADR-0047).
  The app supplies drawing bytes and an authorized credential or free grant. `@google/genai` belongs
  to offline asset tooling, not the application generation path.
* **Workbox** precaches the export and bundled starter book. The export build writes the web
  manifest, prerendered documents and content-addressed offline shell (ADR-0180/0181).
* **Vitest**, **Playwright**, **Lighthouse** and **Maestro** serve unit/mounted tests, browser
  behavior, page load and native launch checks respectively. See `docs/TESTING.md`.

`npm run build:site` produces the deployed export. Its guards check precache integrity, startup
budgets, page documents, the admin console and safe-area layouts. `npm run check` type-checks the
retained shared modules, Netlify function, app and browser tests. Native builds use
`npm run android:apk`, `npm run android:bundle`, `npm run ios:simulator` and `npm run ios:ipa`; the
mobile guide owns signing and identity (`docs/MOBILE/native.md`).

## Source Map

Paths in the following app table are relative to `src/`. The platform split is deliberate: inspect
both variants before changing a shared contract.

| Path                                                           | Owner                                                                               |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `ProbeApp.tsx`, `useDrawingScreen.ts`                          | Application composition and drawing-screen wiring.                                  |
| `product/`                                                     | Drawing session, product actions, modal routing, Back handling and deferred owners. |
| `drawing/model.ts`                                             | Drawing state and its mutation/subscription contract.                               |
| `drawing/paperInputOwner.ts`, `drawing/paperSpace.ts`          | Contact ownership and paper-coordinate input.                                       |
| `drawing/PaperInputView.tsx`, `drawing/PaperInputView.web.tsx` | Platform input surfaces.                                                            |
| `drawing/SkiaInk.tsx`, `drawing/skiaInkScene.ts`               | Native ink scene and its Skia presentation.                                         |
| `drawing/InkLayer.web.tsx`                                     | Browser ink presentation.                                                           |
| `drawing/checkpoints.ts`                                       | Flattened drawing history and retained undo state.                                  |
| `drawing/pictureCompose.ts`, `drawing/pictureCompose.web.ts`   | Platform picture composition.                                                       |
| `drawing/perfProbe.native.ts`, `drawing/perfReplay.ts`         | Opt-in native contact-cohort probe and replay.                                      |
| `drawing/bundledFarm/`, `drawing/bundledBookAssets.ts`         | Bundled starter-book artwork.                                                       |
| `rsdDrawing/RsdDrawingScreen.tsx`                              | Shared RSD screen structure.                                                        |
| `rsdDrawing/RsdActionsPanel.tsx`                               | Actions Panel and drawer controls.                                                  |
| `rsdDrawing/RsdSettingsRoute.tsx`                              | Settings surface routing.                                                           |
| `rsdDrawing/tokens.css.ts`                                     | Generated RSD design-token projection.                                              |
| `settings/`                                                    | Persisted preferences, section definitions, activity stamps and write ordering.     |
| `parentCenter/`                                                | Parental-gate policies, challenge state and protected operations.                   |
| `ai/`                                                          | Generation, credentials, journal recovery, progress, result validation and reports. |
| `export/`                                                      | Picture names, saves, retained unsaved pictures and failure outcomes.               |
| `offlineLibrary/`                                              | Installed-book catalog, manifest verification and platform storage.                 |
| `clear/`                                                       | Drag-to-clear gesture and its dock geometry.                                        |
| `audio/`, `useDrawingSound.ts`                                 | Drawing and clear audio.                                                            |
| `install/`                                                     | Browser installation policy, banner and guide copy.                                 |
| `platform/`                                                    | File, network, secure storage, orientation and other platform integrations.         |
| `pageDocument/`                                                | Browser document entries, admin console and styleguide.                             |
| `information/`                                                 | Shared information-page content and navigation.                                     |
| `prerenderFirstFrame.tsx`                                      | Drawing screen's prerendered first frame (ADR-0180).                                |

### Retained shared TypeScript

Paths here are relative to `src/lib/`. These modules remain in use by the app, functions or asset
tooling; the Svelte components, rune stores and tiled Svelte drawing runtime are retired.

| Path                                                                                   | Owner                                                                                    |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `drawing/strokeMath.ts`, `tools/store-drawings/lib/strokeSettings.ts`                  | Shared stroke geometry and size vocabulary.                                              |
| `drawing/paperView.ts`                                                                 | Pure contain-fit paper geometry for rotation.                                            |
| `design/`                                                                              | Shared design values projected into RSD by `tools/migration/gen-rsd-drawing-tokens.mjs`. |
| `coloringBooks/`, `coloringPacks/`                                                     | Shared catalog, asset and pack contracts used by tooling/app code.                       |
| `safeAreaMatrix/`                                                                      | Device-profile geometry used by export layout validation.                                |
| `platform/deviceReport.ts`                                                             | Report vocabulary, ordered labels and server sanitization.                               |
| `report.ts`, `imageReport.ts`                                                          | Shared feedback/report kinds, field names and retention contracts.                       |
| `usageRecord.ts`                                                                       | Closed usage outcomes and server record shape.                                           |
| `server/api/`                                                                          | One endpoint module per `/api` path; dispatched by the Netlify Function.                 |
| `server/api/apiFunction.ts`, `server/apiCors.ts`, `server/csrf.ts`                     | Request dispatch, CORS, cache/security defaults and CSRF checks.                         |
| `server/privateEnv.ts`, `server/config.ts`, `server/runtimeMode.ts`                    | Explicit process configuration and local-host mode.                                      |
| `server/ai/provider.ts`, `server/ai/openai.ts`                                         | Provider contract and its sole production OpenAI adapter.                                |
| `server/ai/openaiSafety.ts`, `server/ai/imageSize.ts`                                  | Provider outcome classification and byte-derived image dimensions.                       |
| `server/generationAuthorization.ts`, `server/freeGenerationGrants.ts`                  | Generation authorization and durable free-grant ledger.                                  |
| `server/tokens.ts`, `server/admin.ts`                                                  | Managed codes and bearer admin sessions.                                                 |
| `server/report.ts`, `server/github.ts`                                                 | Feedback validation and private issue submission.                                        |
| `server/imageReport.ts`, `server/imageReportAuthorization.ts`, `server/reportToken.ts` | Evidence validation and credential-bound report authorization.                           |
| `server/imageReportStore.ts`, `server/imageReportStoreName.ts`                         | Retained evidence storage and purge ownership.                                           |
| `server/http.ts`, `server/logRedaction.ts`                                             | Bounded request parsing, response helpers and capability redaction.                      |
| `server/rateLimit.ts`, `server/rateLimitKeys.ts`, `server/rateLimitPolicy.ts`          | Shared in-memory limiter, bucket identities and policy.                                  |
| `server/usage.ts`, `server/usageRecordStorage.ts`                                      | Durable usage tallies, validation and retention.                                         |
| `icons/`, `releases.json`                                                              | Source icon assets and generated release data.                                           |

The API reference (`api` skill) owns endpoint details. `tools/lib/netlify-function-host.mjs`
provides a plain Node local function host; it does not run a SvelteKit or Netlify Dev server.
`e2e/server/serve.ts` combines the built export and that function on one loopback origin with the
controlled test environment in `e2e/server/serverEnv.ts`.

## Web routes

The web export is static, including its first drawing frame. Client code hydrates interactive
surfaces. There are no SvelteKit route modules or per-request page renders.

| Route        | Export / handler           | Purpose                                                         |
| ------------ | -------------------------- | --------------------------------------------------------------- |
| `/`          | `index.html`               | Drawing screen, palette and controls.                           |
| `/privacy`   | `privacy.html`             | Readable privacy policy, including without JavaScript.          |
| `/changelog` | `changelog.html`           | Release history with canonical section links.                   |
| `/feedback`  | `feedback.html`            | Standalone feedback surface using the API.                      |
| `/beta`      | `beta.html`                | Web-only Android/TestFlight instructions.                       |
| `/design`    | `design.html`              | Public web styleguide.                                          |
| `/admin`     | `admin.html`               | Unlinked web-only bearer-session administration.                |
| Unknown page | `404.html`                 | Prerendered not-found document.                                 |
| `/api/*`     | `netlify/functions/api.ts` | Generation, grants, reporting, verification and administration. |

`netlify.toml` owns edge redirects, function routing and deployed response headers. The legacy solo
beta URLs redirect to `/beta`; the old `/dev` and `/dev/engine` Svelte harnesses are retired.

## UI Elements

This glossary is the naming authority for controls and surfaces. Implementation paths below refer to
the React Native app's `src/` tree, not retired Svelte components.

> **Layout notes (read before positioning a new control):**
>
> * The **Color Palette** is a top row in portrait and a left column on landscape tablets. Landscape
>   phones use the **Color Button** in the Actions Panel.
> * Anchor paper overlays to the measured drawing area. Rotation can letterbox the locked paper;
>   viewport corners and paper corners are not interchangeable.
> * **Bare toolbar** removes the raised button tiles and exposes the paper beneath the controls. The
>   palette rail and Actions Panel still intercept their own input.
> * Give every modal a stable accessible name. `e2e/specs/a11y.spec.ts` checks browser dialogs.
> * The **Settings Button**, **Actions Panel** and their flyouts share the bottom edge. Check their
>   collision and safe-area behavior together (`docs/SAFE-AREA.md`).

* **Color Palette** — bar holding the ink colors.
  * **Color Swatch** — one circular color choice.
  * **Selection Ring** — the active swatch's colored ring.
* **Color Button** — loaded-ink splotch used on landscape phones; opens the compact palette.
* **Gradient Swatch** — honeycomb shortcut to the custom **Color Picker**.
  * **Hexagon Grid** — honeycomb of shades, arranged by orientation.
  * **Color Hexagon** — one shade; dragging explores and lifting chooses it.
* **Drawing Canvas** — the touch-responsive drawing surface.
  * **Paper View** — the upright, contain-fit presentation of rotation-locked paper.
  * **Paper Sheet** — the textured sheet beneath ink; letterbox margins are outside the paper.
* **Fullscreen Toggle** — opt-in browser control for immersive fullscreen where supported.
* **AI Style Prompt** — style-cover grid under “Pick a style”. Choosing a style starts the result.
* **AI Result** — generation progress, finished picture and save/report actions, or an error.
* **Waiting Polaroid** — the pinned drawing/progress print that reopens a minimized AI result; it
  shows the finished picture when ready (`ai/AiWaitingPolaroid.tsx`, ADR-0116/0117).
* **Notch Band** — drawing-colored strip at a cutout edge; eraser uses paper color (ADR-0026).
* **Clear Button** — floating trash control for drag-to-clear.
  * **Clear Preview Line** — torn edge showing the proposed clear.
  * **Clear Accept Zone** — dashed/ready ring indicating the clear threshold.
  * **Page Turn Overlay** — departing-sheet feedback after a clear.
* **Actions Panel** — corner controls and their expandable drawer.
  * **Brush Button** — direct toggle for one optional brush, menu for several, absent for none.
  * **Brush Menu** — **Pen**, **Crayon**, **Magic Brush** and **Eraser**, filtered by preferences.
    Magic reveals the page fill, or a rainbow on blank paper. Rendering/history belong to the RN
    drawing model; the Svelte tiled-op implementation is retired.
  * **Undo Button** — reverts the latest undoable drawing action.
  * **Screenshot Button** — saves the drawing picture.
  * **Stroke Width Button** — opens the thickness flyout.
  * **Coloring Book Button** — opens the book picker.
* **Coloring Book Picker** — selection dialog.
  * **Coloring Book Grid** / **Coloring Book Tile** — available books and one cover choice.
  * **Coloring Page Grid** / **Coloring Page Tile** — a book's pages and one page choice.
  * **Coloring Page Overlay** — selected line art aligned to the paper and its ink.
* **Install Banner** — dismissible browser prompt to add Splotch to the home screen.
* **Save Failure Banner** — parent-directed notice retaining the pictures that failed to save, with
  retry and platform-appropriate recovery actions (`export/saveFailure.ts`).
* **Parental Gate** — “Grown-Ups Only” arithmetic challenge guarding sensitive operations at their
  boundary, including AI launch, reporting, links, feedback and Parent Center (ADR-0094).
  `parentCenter/` owns policy and challenge state; platform defaults are in `platform/`.
* **Leave Splotch Dialog** — Android Back confirmation when a drawing would be left
  (`rsdDrawing/RsdLeaveConfirm.tsx`, ADR-0165).
* **Settings Button** — opens Settings.
  * **Settings** — section-based preferences and information, using a phone **Hub** with drill-ins
    or a wide **Sidebar** beside the content **Pane** (ADR-0061). Its sections are Appearance,
    Sound, Tool Drawer, Accessibility, Coloring, AI Art, Saving, Parent Center, Install, Feedback,
    What's New (drill-in title “Updates”) and About, declared by `settings/settingsSections.ts`.
  * **Hub Row** — section icon, title and current subtitle; Appearance and Sound also offer an
    inline toggle.
  * **Section Activity Dot** — unread-content marker, persisted by `settings/sectionsSeen.ts`.
  * **Install Guide** — device-family instructions and available installation action.
  * **Tool Drawer Section** — drawer enablement and individual tool visibility preferences.
  * **Accessibility Section** — **Button Size** and **Reduce Motion** controls.
  * **Appearance Control** — Light / Dark / System choice for paper, controls and page fills. Saved
    pictures follow the resolved theme (ADR-0052).
  * **Button Style Control** — Raised / Flat; Flat is the user-facing name of **Bare toolbar**
    (ADR-0166).
