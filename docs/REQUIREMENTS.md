# Splotch — Product Requirements

A complete, implementation-independent specification of Splotch: a drawing app for toddlers
(ages 2+). Someone with no access to this codebase should be able to build a functionally
equivalent product from this document alone — even if their version looks and feels different.

## How to read this document

* Requirements are written as **user stories** with **acceptance criteria** (AC). An AC is a
  testable statement; a re-implementation reaches feature parity when every AC holds.
* **Personas:**
  * **Child** — the toddler artist (2+). Cannot read, taps everything, uses multiple fingers.
  * **Parent** — the caregiver who sets up the device, configures features, and supervises.
  * **Operator** — whoever runs the hosted service: issues access codes, watches usage, pays
    the AI bill.
* **Reference values.** Where a number is essential to the experience (e.g. "updates never
  erase an in-progress drawing"), it is binding. Where a number is a tuning default (e.g. exact
  color hues, pixel widths, animation durations), it is marked *(reference)* — match the intent;
  the exact value may differ.
* **Technology independence.** Nothing here requires a particular framework, language, hosting
  provider, storage engine, or AI vendor. Platform features (Apple Pencil, iOS Guided Access,
  Android App Pinning, browser install prompts) are named because the *platforms* are
  requirements, not because of how the current app is built. Shipping all targets from a single
  codebase is explicitly **not** required.

---

## 1. Product vision & guiding principles

These principles motivate every requirement below and resolve ambiguity when ACs are silent.

* **P-1 — A blank page and a box of crayons.** The whole screen is a drawing surface. There are
  no menus to get lost in, no navigation, nothing to scroll, and nothing a small stray tap can
  break or buy.
* **P-2 — Zero-account, zero-monetization.** No sign-up, no login, no ads, no tracking, no
  in-app purchases, no social features. The app is free to use.
* **P-3 — Progressive disclosure.** The default experience is minimal. Every advanced control
  can be individually enabled/disabled by a parent, and advanced tools can be tucked into a
  collapsible drawer.
* **P-4 — Offline-first.** The entire core experience works with no network. Exactly one
  feature (AI illustration) requires connectivity, and it hides itself when offline.
* **P-5 — Calm and quiet.** Gentle sounds, restrained prompts, kid-appropriate copy. Anything
  aimed at the parent must be visually low-key so a toddler ignores it.
* **P-6 — Never lose the child's work to the system.** Updates, rotations, and window resizes
  must never erase an in-progress drawing. (Deliberately, the app does *not* promise to restore
  a drawing after the app is closed — see PERS-3.)

---

## 2. Platforms & reach

### PLAT-1 — Four deployment targets

**As a** parent, **I want** Splotch available however my household works — a website, an
installed home-screen app, or a store app — **so that** my child can draw on whatever device we
have.

**Acceptance criteria:**

* The product ships as all four of:
  1. a **web app** at a public URL, usable in a browser with no installation;
  2. an **installable PWA** (or equivalent): added to the home screen, launching full-screen
     without browser chrome;
  3. a **native Android app** distributable through the Play Store;
  4. a **native iOS app** distributable through the App Store.
* The core drawing experience (canvas, tools, colors, undo, clear, coloring books, saving,
  sounds, Parent Center) has feature parity across all four targets, except where a platform
  capability genuinely doesn't exist (see PLAT-3).
* A single shared codebase/build is **not** required — only that all four targets exist and stay
  at parity.
* The native apps work fully offline; only the AI feature and the operator console reach the
  network (they call the hosted service).

### PLAT-2 — Device support floor

**As a** parent with an older hand-me-down device, **I want** the app to run on it, **so that**
the kid tablet doesn't need to be new.

**Acceptance criteria:**

* Web app supports, at minimum: Chrome/Edge 111+, Firefox 114+, Safari 16.4+ (macOS and
  iOS/iPadOS) *(reference — track an equivalent "widely available" baseline over time)*.
* Native iOS app supports iOS 16.4+ (oldest typical device: iPhone 8, 2017).
* Native Android app supports Android 7.0+ (oldest typical device: a maintained 2016-era phone).
* If a native app renders web content, its minimum OS must be provably able to run the exact
  content it ships — a supported device must never get a white screen instead of graceful
  degradation.
* Below the floor the app may partially work but is untested and never holds features back.

### PLAT-3 — Graceful capability degradation

**As a** child on any device, **I want** drawing to always work, **so that** a missing device
feature never breaks the app.

**Acceptance criteria:**

* Every optional device capability is detected at runtime; absence degrades silently, never with
  an error. At minimum:
  * no screen wake lock → screen may sleep mid-draw, drawing still works;
  * no haptics → no vibration, gestures still work;
  * no fullscreen API → the fullscreen toggle is hidden entirely;
  * no folder-save capability → the folder option is hidden; saving falls back to a plain
    download;
  * no fine-grained input sampling → strokes are slightly less smooth, never broken;
  * no audio → drawing is silent, never blocked.
* Controls for a capability that cannot work on the current platform are hidden, not disabled —
  the app never advertises something it can't do (see also INST-2).

### PLAT-4 — Orientation and screen-shape support

**As a** child, **I want** to draw whether the device is upright or sideways, **so that** however
I grab the tablet works.

**Acceptance criteria:**

* Both portrait and landscape are fully supported; layout adapts (see CANV-1).
* All floating UI respects device safe-area insets (notches, hole-punches, home-indicator
  bars) — nothing interactive hides under a cutout.
* A parent can lock rotation and force a preferred orientation (see PC-5).

---

## 3. Canvas & drawing surface

### CANV-1 — Full-screen paper canvas with floating controls

**As a** child, **I want** the whole screen to be my paper, **so that** I can draw big.

**Acceptance criteria:**

* The drawing surface fills the screen; the page never scrolls or pans.
* The canvas looks like paper: a warm off-white background with a subtle paper-grain texture
  *(reference: `#fcfbf8`)*.
* Floating controls overlay the canvas:
  * a **color palette** — a horizontal row along the top edge in portrait; a vertical column
    down the left edge in landscape (may fall back to two columns on short screens);
  * a **clear (trash) button** docked to the right edge;
  * an **actions panel** (tool buttons) in the bottom-left, collapsible (see PC-4);
  * a small, visually faded **parent button** in the bottom-right (see PC-1);
  * an optional faded **fullscreen toggle** (only where entering fullscreen is possible and
    useful, e.g. Android browsers with a persistent URL bar; never auto-triggered).
* A thin **status-strip band** fills the top safe-area cutout region and is painted with the
  currently selected drawing color (paper-white while erasing); it is hidden on devices with no
  cutout.

### CANV-2 — Drawing survives resize and rotation

**As a** child, **I want** my picture to still be there when the device rotates, **so that**
moving around doesn't destroy my work.

**Acceptance criteria:**

* Resizing the window (web) preserves the drawing; if the window grows, existing content is
  preserved and new blank space is added.
* Rotating the device preserves the drawing. Content that falls outside the visible area in the
  new orientation is retained and reappears when rotating back — rotation is lossless
  round-trip.
* A stroke in progress during a resize/rotation is not lost; it continues/replays on the rebuilt
  canvas.
* Rapid continuous resizing (window-edge drag) stays responsive: the expensive rebuild may be
  briefly deferred *(reference: ~150 ms debounce)* while input tracking stays live. Device
  rotation applies immediately.

### CANV-3 — Crisp rendering within a resource budget

**As a** child on a high-density screen, **I want** my lines to look crisp, **so that** the
drawing looks like real marker on paper.

**Acceptance criteria:**

* Strokes rasterize at the display's native pixel density, capped at 2× *(reference)* — beyond
  that, extra pixels cost memory/fill-rate without visible benefit at finger scale.
* Rendering density is fixed for the session (no mid-session density changes).

---

## 4. Drawing tools

### TOOL-1 — Pen (default)

**As a** child, **I want** to touch the screen and see smooth colorful lines, **so that** drawing
feels immediate and good.

**Acceptance criteria:**

* The pen is the default tool on every launch.
* Strokes render as smooth curves (not visibly segmented chords) with rounded caps and joins,
  in the currently selected solid color.
* Fast scribbles remain smooth: all available high-frequency input samples are used when the
  platform provides them.
* Drawing starts on touch-down with no perceptible latency (see PERF-1), and a simple tap leaves
  a dot (taps must register, not only drags).

### TOOL-2 — Eraser

**As a** child, **I want** to rub out parts of my drawing, **so that** I can fix or redo bits.

**Acceptance criteria:**

* The eraser removes paint, revealing the paper (and any coloring-page outlines) beneath — it
  is a true eraser, not white paint.
* At any given size level the eraser is noticeably larger than the pen *(reference: 1.4×)* —
  erasing at exactly pen size is frustratingly precise.
* The eraser has its own remembered size level, independent of the pen's; switching tools
  restores each tool's own last size.
* While erasing, a live cursor bubble shows the eraser's footprint at the pointer (translucent
  circle sized to the eraser).
* Erasing never changes the selected color: toggling the eraser off returns to the pen with the
  previous color intact. Picking a palette color while erasing also exits the eraser back to pen.
* The eraser button shows a clear active state; eraser-related previews use a distinct accent
  color so they can't be confused with paint.

### TOOL-3 — Magic brush on a coloring page

**As a** child coloring a page, **I want** a magic brush that paints the "right" colors, **so
that** I can color the picture in perfectly just by rubbing.

**Acceptance criteria:**

* Every coloring page has a pre-authored full-color version ("colored twin") whose regions align
  with the line art.
* With a page applied, the magic brush reveals the twin's **flat fill colors** exactly where the
  child strokes, registered under the page's outlines.
* The twin's own outline pixels are **not** revealed (the page overlay remains the single source
  of line work) — revealing both must not produce doubled/ghosted lines.
* Revealed paint behaves like ordinary ink thereafter: it participates in undo, the eraser
  removes it, and a later ordinary stroke paints over it (normal draw-order semantics).
* If the twin hasn't loaded yet, the brush reveals nothing (it never falls back to another color
  source mid-page); once the twin arrives, already-drawn magic strokes fill in.

### TOOL-4 — Magic brush on a blank canvas

**As a** child on a blank page, **I want** the magic brush to paint rainbows, **so that** the
magic works everywhere.

**Acceptance criteria:**

* With no coloring page applied, the magic brush reveals a colorful gradient (e.g. a rainbow
  sweep) sampled at each stroke point.
* The gradient is chosen randomly from a varied pre-generated set *(reference: 10 gradients with
  randomized angle, hue span, saturation, lightness)* the first time the brush is used on a
  blank canvas.
* The chosen gradient is **held** for the whole drawing — switching tools and back keeps the
  same palette, so one picture stays color-coherent. Clearing the canvas releases it; the next
  magic use picks a fresh one.

### TOOL-5 — Tool exclusivity

**Acceptance criteria:**

* Exactly one of pen / eraser / magic brush is active at a time; eraser and magic brush are
  modifiers that always return to the pen when toggled off.

---

## 5. Stroke size

### SIZE-1 — Five discrete sizes

**As a** child (or the parent helping), **I want** a few chunky size choices, **so that** I can
draw thick or thin without fiddly sliders.

**Acceptance criteria:**

* Five discrete size levels, spanning fine detail to chunky-crayon *(reference pen widths:
  2 / 4 / 8 / 14 / 22 units; default level 3)*.
* A size button in the actions panel opens a flyout of the five sizes; the size previews render
  in the active color (in the eraser accent while erasing); picking one applies it and closes
  the flyout.
* The flyout re-orients to fit the screen (row vs column) rather than colliding with other
  controls.
* Pen size and eraser size persist independently across sessions.
* If the active color is white, size previews get a dark outline so they don't vanish on white
  buttons.

---

## 6. Color selection

### COL-1 — The palette

**As a** child, **I want** big bright color buttons, **so that** I can change colors myself.

**Acceptance criteria:**

* A persistent palette of round swatches: **7 core colors** (purple, blue, green, yellow,
  orange, red, black) plus up to **3 bonus colors** (teal, brown, pink) *(reference hues:
  `#AB71E1` `#62A2E9` `#8CC864` `#F9D24F` `#F89C45` `#EC534E` `#0a0b10`; bonus `#4FC4C0`
  `#B5835A` `#F47CB0`)*, plus one **custom-color** swatch (COL-3).
* **Purple is the default selection** on every launch.
* The selected swatch shows a visible selection ring tinted to match the color (adjusted for
  very dark colors so it stays visible), with a brief selection animation.
* Tapping a swatch selects the color and, if erasing, switches back to the pen.
* The palette contains no white — white is available only in the custom picker.

### COL-2 — Space-adaptive palette

**As a** child on a small phone or a huge tablet, **I want** the palette to fit, **so that**
swatches are always big enough to hit.

**Acceptance criteria:**

* When space runs short, swatches are trimmed in a fixed priority order (bonus colors first,
  then the least essential core colors; black and the default purple are kept longest).
* Bonus colors appear only when there is generous room (e.g. tall landscape screens).
* Adaptation happens without any flash of a wrong layout (resolved by first paint).

### COL-3 — Custom color picker

**As a** slightly older child or parent, **I want** to explore lots of colors, **so that** I can
find exactly the shade I want.

**Acceptance criteria:**

* The custom swatch opens a full-screen modal picker over a dimmed/blurred backdrop, animating
  out from the tapped swatch.
* It presents a large curated grid *(reference: 81 hexagon tiles in a 9×9 honeycomb)* organized
  by color family (reds, oranges, yellows, greens, blues, purples, pinks, browns, greys).
* White is available here (with a dark border so it's visible on a light background).
* Two interaction modes both work: a direct **tap** selects; a **press-and-drag** across tiles
  enlarges/highlights the hovered tile and selects it on lift ("scrub to explore").
* Near-miss taps snap to the nearest tile within a generous tolerance *(reference: 40 px)* —
  a stylus landing in a gap still picks a color.
* On small screens rows/columns are trimmed to fit rather than overflowing.
* Selecting closes the picker, makes the color active, and the custom swatch remembers/displays
  the last custom choice with a matching ring. Backdrop tap dismisses without changing color.

---

## 7. Undo

### UNDO-1 — One-tap undo (no redo)

**As a** child (or the parent), **I want** to un-do the last scribble, **so that** one mistake
doesn't ruin the picture.

**Acceptance criteria:**

* An undo button removes the most recent action. There is deliberately **no redo**.
* **One undo step = one contact group**: everything drawn while at least one finger/pointer was
  continuously down counts as a single step (a two-handed multi-finger scribble undoes as one).
* A **clear is itself one undo step** — undo immediately after clearing restores the drawing.
* Undo history holds at least the last 10 steps *(reference)*; older work becomes permanent.
* The button is visibly disabled when there is nothing to undo, and undo restores dependent
  state exactly (e.g. if undo empties the canvas, save/AI buttons disable again).
* On devices with a keyboard, the platform-standard undo shortcut (Ctrl/Cmd+Z) also works.
* Undo latency is imperceptible regardless of how long the session has been (see PERF-2).

---

## 8. Clear (new page)

### CLR-1 — Drag-to-confirm clear

**As a** parent, **I want** clearing to require a deliberate gesture, **so that** my toddler
can't wipe their own drawing with one stray tap.

**Acceptance criteria:**

* A single tap on the clear button **never** clears.
* Clearing is a press-and-drag gesture: dragging the trash button toward the canvas past a
  distance threshold *(reference: 40 % of the smaller viewport dimension)* and releasing clears
  the page.
* Drag progress shows a live preview (e.g. a spreading wash of blank paper) so the outcome is
  visible before committing; crossing the threshold gives clear feedback (button emphasis + a
  single haptic tick where supported).
* Releasing **before** the threshold cancels with no effect; the button springs home.
* A committed clear plays a satisfying page-turn/reset animation.

### CLR-2 — Teach the gesture, absorb the mashing

**As a** child who just taps the trash can, **I want** the app to show me how it works, **so
that** mashing does something helpful instead of destructive.

**Acceptance criteria:**

* Holding the button still *(reference: 500 ms)* or tapping it repeatedly *(reference: 3 taps
  within 1 s)* plays a looping tutorial animation miming the drag gesture — it never clears.
* The tutorial auto-dismisses after a few seconds *(reference: 6 s)* or when a real drag starts.
* With "reduce motion" enabled, a static instructional frame is shown instead of the loop.

### CLR-3 — Optional save-on-clear

**As a** parent, **I want** every cleared drawing quietly saved first, **so that** nothing my
kid makes is ever lost.

**Acceptance criteria:**

* A parent setting (default **off**) saves the drawing to the device (per SAVE-2) immediately
  before any clear of a non-empty canvas.
* The saved snapshot is captured synchronously at the moment of clearing — a clear immediately
  after drawing can never save a blank page.

---

## 9. Saving & exporting drawings

### SAVE-1 — One-tap save with delightful feedback

**As a** child, **I want** a camera button that keeps my picture, **so that** we can look at it
later.

**Acceptance criteria:**

* A save (camera) button captures the drawing as a standard image file (PNG or equivalent).
* The export composites everything the child sees: paper background + texture + strokes + the
  applied coloring page's line art. Export resolution is at least 2× logical size *(reference)*.
* The button is disabled while the canvas is empty.
* Feedback is immediate and playful *(reference: a camera flash and a "polaroid" of the drawing
  flying out of the button, ~1.9 s)* and never waits for the actual disk write.
* Repeated rapid taps don't queue duplicate saves mid-animation.
* Filenames are timestamped and identifiable *(reference: `splotch-YYYY-MM-DD_HH-MM-SS.png`)*.

### SAVE-2 — Platform-appropriate destinations

**As a** parent, **I want** saved drawings to land where photos normally live on my device,
**so that** I can find and share them without hunting.

**Acceptance criteria:**

* Android app: saved into a dedicated app-named album in the device photo gallery
  (auto-created).
* iOS app: saved to the camera roll using add-only photo permission (the app never reads the
  library).
* Desktop web (where the browser supports directory access): a parent may pick a folder once,
  after which saves write silently into it with no download prompt; the parent can re-pick or
  clear the folder.
* Everywhere else (mobile web, browsers without folder support): a normal browser download.
* If a previously chosen folder is gone (moved/deleted), the next save detects it, drops the
  stale choice, updates the settings display, and silently falls back to a download.
* Saved images are written only to the local device — never uploaded (see PRIV-2).

---

## 10. Coloring books

### BOOK-1 — A built-in coloring-page library

**As a** child, **I want** pictures to color in, **so that** I don't always start from nothing.

**Acceptance criteria:**

* The app ships a curated library of black-and-white line-art coloring pages, organized into
  themed books. *(Reference catalog: Farm, Dinosaurs, Creatures, Nature, Objects, Shapes,
  Space, Vehicles — 8 books of ~5–6 pages each, ~46 pages total.)* Equivalent scope and
  toddler-appropriate variety is the requirement; the exact art is not.
* Every page exists in both portrait and landscape compositions, and each has a matching
  colored twin for the magic brush (TOOL-3).
* All pages are bundled with the app and available offline on every target.

### BOOK-2 — Two-level picker

**As a** child, **I want** to pick a book then a picture, **so that** choosing is easy.

**Acceptance criteria:**

* A coloring-book button in the actions panel opens a modal picker (animating from the button).
* Level 1 shows book covers with labels; level 2 shows that book's pages as tap-to-apply
  thumbnails, with a back control. Thumbnail shape/columns adapt to orientation.
* When a page is currently applied, a prominent **"Clear page"** tile appears first and removes
  the overlay without touching the child's paint.
* Tapping a page applies it and closes the picker.

### BOOK-3 — How a page behaves on the canvas

**Acceptance criteria:**

* The page's outlines always remain visible above the child's paint (as if drawing on a printed
  page); the art's white areas are transparent to the paper.
* Rotating the device swaps to the page's matching orientation art; the child's paint follows
  CANV-2 rules.
* The applied page is included in saved/exported images (SAVE-1) and in the AI feature's input.
* Applying, switching, or clearing a page never erases the child's strokes.

### BOOK-4 — Instant-feeling picker

**As a** child on a slow connection, **I want** the picture menu to open instantly, **so that**
I don't wander off while it loads.

**Acceptance criteria:**

* Grids use small thumbnail renditions *(reference: ~15 KB each)*, not full-resolution art.
* Cover thumbnails are pre-warmed in the background after launch so the first open paints
  immediately; hovering/pressing a book pre-fetches its page thumbnails; hovering/pressing a
  page pre-fetches its full-resolution art so applying it is immediate.

---

## 11. AI illustration ("magic picture")

### AI-1 — Transform my drawing

**As a** child, **I want** a magic wand that turns my scribble into a beautiful picture, **so
that** I can see my ideas "for real".

**Acceptance criteria:**

* A wand button sends a snapshot of the current canvas (including any coloring page) to an
  image-generation AI service, which returns a polished illustration that **preserves the
  child's subjects, shapes, and composition** (it must re-render the child's idea, not invent an
  unrelated image; scribbled fills are read as intentional solid color).
* The child never types anything: the only creative input is the drawing itself plus an optional
  **style** chosen from a fixed, curated set *(reference styles: Default, Crayon, Watercolor,
  Paper, Felt, Sticker, Cartoon, Pixel)*. Arbitrary/free-text prompts must be impossible from
  the client (see AI-5, API-1).
* The wand button is visible **only when all hold**: the feature is parent-enabled, a valid
  credential exists (ACC-1), and the device is online. It disables while the canvas is empty or
  a generation is in flight.
* With the parent's "customization" setting on, tapping the wand opens a style-thumbnail
  picker and picking a style starts generation; with it off, tapping generates immediately in
  the default style.

### AI-2 — Waiting is part of the show

**As a** child, **I want** something fun to watch while the magic works, **so that** several
seconds of waiting doesn't feel broken.

**Acceptance criteria:**

* A result view opens **instantly** on tap, showing the child's own drawing blurred behind an
  animated progress indicator that fills over an estimated duration *(reference: ~10 s)* and
  visibly keeps living (pulsing) if the wait runs long.
* On arrival the reveal celebrates *(reference: dial races full, confetti, blur sharpens into
  the finished image)*.
* While a generation is in flight the view **cannot be dismissed accidentally** (backdrop tap /
  Esc do nothing); only an explicit close control abandons it.
* Requests time out at **120 s** end-to-end with a friendly "taking too long — try again"
  message.

### AI-3 — Keeping the picture

**Acceptance criteria:**

* Default: a download/save control appears with the result and saves per SAVE-2, with a
  playful send-off animation; duplicate saves are prevented mid-animation.
* With the parent's **auto-save** setting on (default off): the finished illustration is saved
  automatically (along with the child's original drawing), the manual control is replaced by a
  "saved" confirmation, and re-generating from an *unchanged* drawing does not re-save a
  duplicate of that drawing (content-based de-duplication).
* Generated images are never retained by the service (API-1); the app keeps no internal
  gallery — the device's photo library/downloads is the only archive.

### AI-4 — Child-appropriate failure

**As a** child, **I want** a friendly answer when the magic doesn't work, **so that** I know
what to do next.

**Acceptance criteria:**

* Three visually and verbally distinct failure states, all in kid-friendly language:
  1. **Safety refusal** — the service declined the drawing's content: cheerfully redirect
     ("let's try drawing something else!"). Must **not** suggest retrying the same drawing.
  2. **Transient failure / timeout** — invite a retry of the same drawing.
  3. **Generic failure** — a soft "that didn't work, try again".
* There is no automatic retry; the child/parent re-triggers manually.
* A dismissed-early result view leaks no resources and leaves the app fully usable.

### AI-5 — AI safety (binding)

**As a** parent, **I want** the AI to be strictly kid-safe, **so that** nothing inappropriate
ever comes back to my toddler.

**Acceptance criteria:**

* The generation pipeline **refuses rather than beautifies**: drawings depicting or implying
  realistic weapons/violence/blood/self-harm, nudity or sexual content, hate symbols or slurs,
  or drugs/alcohol/adult content are declined — never rendered "nicer".
* Ordinary toddler pretend-play must **not** be over-refused: toy/costume props, magic wands,
  water blasters, friendly dragons and monsters are welcome and render as cheerful make-believe.
* Bias toward refusal on borderline content (false negatives are worse than false positives),
  while both axes are tested.
* An AI response containing prose but no image is treated as a safety refusal (that is how image
  models often decline); a genuinely empty/failed response is treated as a transient failure —
  the two must map to the distinct UX states in AI-4.
* Vendor-side safety filters are set to their strictest available levels; the app adds its own
  refusal instruction and response classification on top (defense in depth). The classification
  logic is deterministic and covered by automated tests.
* A **red-team suite** exercises both must-block and must-allow probe drawings (including
  explicit anatomy, self-harm, hate symbols, and prompt-injection text embedded in drawings)
  with human-reviewed results before releases that touch the AI path. Unsafe probe imagery is
  stored encrypted, never as viewable files in the repository, and the suite never runs
  unattended in CI.

---

## 12. AI access control & entitlements

### ACC-1 — Two ways to unlock

**As an** operator, **I want** the paid AI feature gated, **so that** strangers can't spend my
money; **as a** parent, **I want** a self-serve way in, **so that** I don't need the operator's
permission.

**Acceptance criteria:**

* AI generation requires exactly one of two credentials:
  1. a **managed access code** — a human-friendly string on an operator-controlled allow-list;
     generation then runs on the operator's own AI account; or
  2. a **parent-supplied AI key (BYOK)** — generation bills the parent's own AI-provider
     account and bypasses the allow-list and per-code limits entirely.
* With neither credential, the AI feature is locked: the wand button is absent and the Parent
  Center explains the two options (BYOK presented as the primary self-serve path).
* The operator's own AI-provider key lives only on the service — it is never delivered to any
  client.

### ACC-2 — Entering and verifying a credential

**Acceptance criteria:**

* One input field in the Parent Center accepts either credential; the app distinguishes them by
  shape/format and verifies with the service before accepting:
  * access codes are checked against the allow-list;
  * BYO keys are verified with a **minimal-cost** live probe against the AI provider (proving
    the key works without a full generation).
* Clear friendly errors for an invalid code vs an invalid key.
* Verification endpoints are brute-force-throttled (API-2).

### ACC-3 — Invite links

**As an** operator, **I want** to hand a parent one link that just works, **so that** onboarding
is zero-effort.

**Acceptance criteria:**

* Every access code yields an invite URL (the app's address with the code as a parameter).
  Opening it captures the code into device storage automatically and **removes it from the
  visible URL** (no secret left in the address bar / history line).
* Invite links have no built-in expiry; they are valid until the code is revoked.

### ACC-4 — Live revocation

**Acceptance criteria:**

* Every generation re-checks the presented code against the current allow-list; removing a code
  takes effect on the **very next request**, globally, with no app update or restart.
* A revoked/unknown code gets an unauthorized error; the client returns the parent to the
  credential screen.

### ACC-5 — Credential storage on the device

**Acceptance criteria:**

* The parent's BYO key is stored **only on the device**, encrypted at rest (hardware-backed
  secure storage on native; equivalent-strength encrypted storage on web where the key material
  is non-exportable), and is never persisted service-side.
* Any legacy plaintext copy from an older version is migrated into secure storage and scrubbed
  on startup.
* Access codes persist on the device until changed; the app asks the platform not to evict this
  storage where such a request exists.

---

## 13. Sound, haptics & motion

### SND-1 — Drawing sounds

**As a** child, **I want** my pencil to make a sound, **so that** drawing feels alive.

**Acceptance criteria:**

* A gentle pencil-scratch loop plays while a stroke is being drawn, with natural variety
  *(reference: one of 3 recordings chosen randomly per stroke)*.
* Volume tracks stroke speed — near-silent when the pointer is slow/still, full at a brisk
  scribble *(reference: full volume at 0.45 canvas-px/ms)* — with smooth ramps (no clicks).
* Sound stops immediately when the stroke ends, including when it ends unusually (e.g. a
  mid-stroke tap on a control).
* The very first stroke after launch is not silent (sounds are pre-loaded at idle or on demand).
* A parent toggle turns drawing sounds off; a volume control scales loudness *(reference:
  0–100, default 50)*.

### SND-2 — Haptics

**Acceptance criteria:**

* A single short haptic tick fires when the drag-to-clear threshold is crossed (CLR-1) and when
  a stylus hardware gesture toggles the eraser (INP-3), on platforms with haptics.

### SND-3 — Motion sensitivity

**Acceptance criteria:**

* All decorative animation respects the platform's "reduce motion" preference with static or
  minimal equivalents.

---

## 14. Toddler-proofing & input handling

### TP-1 — A stable, unbreakable viewport

**As a** parent, **I want** stray multi-finger gestures to do nothing weird, **so that** my
toddler can't zoom, pan, or navigate away from the paper.

**Acceptance criteria:**

* Pinch-zoom of the app viewport is disabled everywhere — the drawing surface can never be
  zoomed or panned off-screen. (This is a deliberate, documented trade-off against
  accessibility zoom guidance; do not "fix" it without a product decision.)
* Long-press context menus are suppressed over the app.
* The page never scrolls; there is no browser-chrome interaction required during play.

### TP-2 — Screen stays awake

**Acceptance criteria:**

* While the app is in use the screen is kept awake (requested from first interaction and
  re-acquired when returning to the foreground), where the platform allows.

### TP-3 — System edge gestures don't leave paint

**As a** child drawing near the screen edge, **I want** the app to tell my strokes apart from
the phone's own swipe gestures, **so that** going "home" doesn't leave a paint streak — and
edge drawing still works.

**Acceptance criteria:**

* A touch starting within a small band of a guarded edge *(reference: 24 px)* is buffered, not
  painted, until it travels a minimum distance *(reference: 12 px)*:
  * if it moves like a system gesture (a fast, mostly-inward flick), it is discarded — no paint,
    and no pollution of undo history;
  * otherwise it commits as a normal stroke **including the buffered start** (no missing stroke
    head).
* Guarded edges follow the platform's actual gesture zones *(reference: bottom edge in
  portrait; both short edges in landscape; a tablet's long bottom edge only when the OS reports
  a real inset there; never the top)*.
* Only finger touches are guarded — stylus and mouse input is never buffered.

### TP-4 — Mash-resistant modals

**As a** toddler who taps the same spot five times, **I want** the menu I just opened to stay
open, **so that** the app doesn't flicker things at me.

**Acceptance criteria:**

* When a modal opens from a button, taps landing near that button's location are swallowed for
  a short window *(reference: 72 px radius, 600 ms)* so repeat-taps can't instantly dismiss or
  re-trigger it.
* Taps on a modal's backdrop never leak through to the canvas beneath.
* Repeated taps on the color picker do not immediately dismiss it.

### TP-5 — Selection taps don't paint

**Acceptance criteria:**

* Immediately after picking a color/tool/size, touch and mouse input is ignored for a very
  short window *(reference: 100 ms)* so the selection tap can't start a stray stroke. Stylus
  input skips this debounce (precise enough not to need it).

### TP-6 — Stylus system-feature interference

**As a** child with a stylus on a tablet, **I want** quick pen strokes to always draw, **so
that** the OS's handwriting recognition never eats my marks.

**Acceptance criteria:**

* Platform handwriting/scribble systems must never swallow or defer quick stylus strokes on the
  canvas, and stylus taps on controls must not arm such systems against the next stroke —
  countered for stylus input specifically, leaving finger input untouched.

### TP-7 — Locking the child into the app

**As a** parent, **I want** guidance to lock the device into Splotch, **so that** handing over
the tablet is safe.

**Acceptance criteria:**

* The Parent Center explains the platform's kiosk feature (iOS Guided Access / Android App
  Pinning) with steps to enable and exit.
* On native, the app detects whether the lock is currently engaged and reflects live status
  (✓ + exit instructions instead of enable instructions), re-checked whenever the panel opens.

### INP-1 — Multi-touch drawing

**Acceptance criteria:**

* Multiple simultaneous fingers each draw their own stroke concurrently (whole-hand scribbling
  is normal use, not an edge case).
* Everything drawn during one overlapping contact group undoes as a single step (UNDO-1).

### INP-2 — Strokes never get cut short

**Acceptance criteria:**

* A stroke that wanders over a floating control or off the canvas edge keeps drawing until the
  pointer lifts (input is captured for the stroke's duration).
* Input-pipeline anomalies must not produce artifacts: a tap-then-draw merged by the platform
  into one stream is split rather than drawing a connecting line *(reference heuristic: idle
  gap > 100 ms plus a jump > 10 % of the canvas's short side)*; a stroke whose start event was
  delivered elsewhere is still adopted by the canvas.

### INP-3 — Stylus hardware gestures

**Acceptance criteria:**

* On iOS with a compatible Apple Pencil, the pencil's double-tap gesture toggles pen ↔ eraser
  with a haptic tick.
* Enabled by default; a Parent Center toggle to disable it appears only after a pencil has ever
  been used on the device (and remains available thereafter, even while disabled).

---

## 15. Parent Center

### PC-1 — A quiet door for grown-ups

**As a** parent, **I want** settings tucked away where my kid won't wander, **so that** the
child screen stays pure.

**Acceptance criteria:**

* A small, low-contrast (visually faded) button in a screen corner opens the Parent Center.
* It is protected by obscurity and the mash-guard (TP-4), not a gate/quiz. *(Known compliance
  question: kids-store policies may require a formal parental gate before outbound links / the
  AI feature — verify at store submission; see PRIV-4.)*
* Everything inside is written for adults.

### PC-2 — Structure

**Acceptance criteria:**

* Four areas: **Settings** (toggles/controls), **AI** (credential management, ACC-2),
  **Setup** (install instructions per INST-3 + device-lock guide per TP-7), **About** (version,
  release notes, project/privacy links). Swipe navigation between areas on touch devices.
* On native app targets, install instructions are omitted (already installed).

### PC-3 — Per-feature toggles

**As a** parent, **I want** to switch individual features on/off, **so that** the app matches my
child's stage.

**Acceptance criteria:**

* Individual toggles, each immediately hiding/showing its control: drawing sounds, save-on-clear
  *(default off)*, screenshot button, undo button, stroke-width control, eraser, coloring books,
  AI feature, AI style customization, AI auto-save *(default off)*, Apple Pencil eraser
  (conditional, INP-3). All others default **on**.
* A returning user's configuration is correct at first paint — never a flash of default controls
  that then disappear.

### PC-4 — Advanced-controls drawer & sizing

**Acceptance criteria:**

* An "advanced controls" master toggle puts the action buttons into a collapsible drawer with a
  chevron; the drawer's open/closed state is remembered *(default closed)*. With the master
  toggle off, controls are simply always visible (no drawer).
* A button-size control scales the action buttons *(reference: 70–130 % of a ~60 px base)*;
  while adjusting, the Parent Center gets out of the way so the parent sees the live result.

### PC-5 — Orientation preferences

**Acceptance criteria:**

* **Lock rotation** *(default on)*: keeps the app in its current/preferred orientation, on
  native overriding the OS auto-rotate.
* **Preferred orientation** *(default: landscape on tablet-class screens, portrait on phones)*.

### PC-6 — About & versioning

**Acceptance criteria:**

* The About area shows the running version and human-readable release notes.
* Every web deployment has a distinct, ordered, human-readable version (so a bug report can pin
  an exact build); native apps carry their deliberate store version. Version derivation must
  never fail a build (degrade to a best-available identifier).
* Hidden operator affordance: repeatedly tapping the version reveals a link to the operator
  console (ADM-1); the link hides again on console logout or failed login.

---

## 16. Installation & onboarding

### INST-1 — Installable web app

**Acceptance criteria:**

* The web app is installable to the home screen; once installed it launches full-screen
  (no browser chrome), with proper icons *(reference: 192 px and 512 px, plus maskable
  variants)* and correct theming.

### INST-2 — The earned install prompt

**As a** parent watching my kid enjoy the app, **I want** a gentle "install me" hint at the
right moment, **so that** I can make it permanent — without the app nagging or baiting my child.

**Acceptance criteria:**

* A small, parent-worded prompt appears only **after the child has drawn a few strokes**
  *(reference: 3)*, and only mounts between strokes — never mid-stroke.
* Platform-correct behavior:
  * where a real one-tap install exists (e.g. Chromium/Android meeting install criteria) →
    a one-tap install button;
  * where install exists but only manually → friendly steps for that browser's menu (e.g.
    iOS Safari's "Share → Add to Home Screen");
  * where install is impossible (already installed, inside the native app, in-app browsers) →
    **nothing is shown, ever**.
* Dismissal (explicit ×, or declining the native dialog) is remembered on the device — it does
  not re-nag.
* If ignored, it auto-dismisses after a few more strokes *(reference: 5, paused while its
  help is expanded or a system dialog is open)*, with a brief parting animation pointing at the
  Parent button.
* If the platform later signals the app is installable again (e.g. it was uninstalled), the
  one-tap offer may return.
* Kid-safety: the prompt must be restrained — small, calm, parent-directed; never a large
  colorful card a toddler would tap.

### INST-3 — Always-available fallback

**Acceptance criteria:**

* The Parent Center's Setup area always shows install instructions (and the one-tap button when
  available), regardless of any prior banner dismissal.

---

## 17. Persistence & on-device state

### PERS-1 — Settings that survive anything

**Acceptance criteria:**

* All parent settings (every PC-3/PC-4/PC-5 value, sound volume, remembered drawer state,
  per-tool sizes, remembered custom color, install-prompt flags, AI credential) persist across
  app restarts, device reboots, and app updates.
* On native, settings survive OS storage-pressure eviction: a durable backup is reconciled on
  next launch so preferences recover with no user-visible loss. (A single not-yet-mirrored write
  lost to a crash in that instant is acceptable.)
* A failed settings write never breaks the running session (the control still works in-memory).
* Locked-down/private web contexts that block storage fall back to defaults gracefully.

### PERS-2 — The drawing is deliberately ephemeral

**Acceptance criteria:**

* The in-progress drawing, its undo history, the active color (boots to purple), and the active
  tool are **session-only** — closing the app abandons them by design.
* The only durable copies of a drawing are the ones explicitly saved out (SAVE, CLR-3, AI-3);
  the app keeps no internal gallery.
* Balanced against P-6: while the app is *running*, nothing systemic (update, rotation, resize)
  may destroy the drawing.

### PERS-3 — No accounts, no sync

**Acceptance criteria:**

* Each device is fully independent: no cross-device sync of settings or drawings, no cloud
  profile, nothing to log into.

### PERS-4 — What the service is allowed to store

**Acceptance criteria:**

* Service-side state is limited to exactly two small operational records, both editable at
  runtime without redeployment:
  1. the access-code allow-list (ACC-1);
  2. a per-code usage tally — count, first-used, last-used, last style *(reference)* — existing
     **solely** for abuse detection (spotting a leaked/shared code).
* No user content is ever stored service-side: not drawings, not generated images, not device
  identifiers, not personal data.
* Stored records have no automatic expiry; they persist until the operator removes them.
* Brief eventual consistency in the operator's view of this data is acceptable; losing a
  concurrent usage increment is not (concurrent use of one code is the very signal sought).

---

## 18. Offline behavior & updates

### OFF-1 — Offline-first core

**Acceptance criteria:**

* After the first successful visit, the web/PWA app loads and runs fully offline: canvas, all
  tools, colors, coloring books, sounds, saving, and every setting. Native apps are fully
  offline from installation.
* Exactly one child-facing feature needs the network — AI illustration — and its button
  **hides itself** when offline (it never appears and then fails).
* Background freshness checks fail silently when offline.

### UPD-1 — Updates never interrupt play

**As a** parent, **I want** app updates to be invisible, **so that** an update never eats a
drawing mid-session.

**Acceptance criteria:**

* A new web/PWA version auto-applies (including any reload) **only while the canvas is blank**;
  if the child is mid-drawing, it silently defers (at latest to the next launch).
* New versions are detected on launch, when the app regains visibility/focus, and periodically
  *(reference: hourly)*.
* A manual page refresh fetches fresh content from the network when online (cache only as
  offline fallback) — a user can always self-unstick with a refresh, within a bounded network
  wait *(reference: 5 s)* before falling back offline.
* Stuck-client self-healing: on startup the app compares its running version against a
  never-cached deployed-version marker and forces one fresh reload on mismatch — only at
  startup with a blank canvas.
* Content updates (sounds, art, icons, code) reach users automatically through this cycle with
  no special publishing steps; for uncached first-time visitors, stable-named media may be
  served stale for a bounded window at most *(reference: ≤ 1 week)*.
* Native apps update through their app stores as deliberate releases, independent of the web
  cycle.

---

## 19. Operator console

### ADM-1 — A console on web and in-app

**As an** operator, **I want** to manage access codes from anywhere, **so that** I can invite a
family or kill a leaked code from my phone.

**Acceptance criteria:**

* An operator console exists at a web address on the hosted service **and** inside the native
  app; both present the same capabilities, and the in-app console operates on the production
  service's live data.
* The console is not linked from any child-facing surface (reachable by URL and by the About
  easter egg, PC-6).

### ADM-2 — Operator authentication

**Acceptance criteria:**

* Access requires a single operator secret held by the service. On login the secret is sent
  once and never stored on the client; the client keeps only a **derived session credential**
  that cannot be reversed into the secret.
* Web sessions ride a scoped, script-inaccessible, strictly same-site cookie; the in-app console
  keeps its session in secure device storage and presents it as a bearer credential. Both
  transports yield the same session validity.
* Sessions are long-lived with no fixed expiry *(reference: renewed on use)*; the **only**
  revocation is rotating the operator secret, which instantly invalidates every outstanding
  session everywhere. A client whose session is rejected falls back to the login form.
* All secret comparisons are constant-time; login is brute-force throttled per address (API-2);
  unauthorized responses are uniform (no oracle about why).
* If no operator secret is configured on the service, login is impossible (fails closed).

### ADM-3 — Console capabilities

**Acceptance criteria:**

* **Issue** a code: free-form human-friendly string; rejects empty and duplicates with inline
  errors. Each code displays with its ready-made invite URL (ACC-3) and one-tap copy for both.
* **Revoke** a code: immediate and global (ACC-4); revoking an already-absent code is a no-op.
* **View usage** per code (web console): generation count, "last used N ago" / "never used",
  with detail on demand (first used, last style) — the operator's signal for spotting a leaked
  code.
* Every mutation's response reflects the complete resulting state (the operator never sees a
  stale list after acting).
* If durable service storage is unavailable, the console still works from a fallback but shows
  a prominent warning that edits may not persist (the operator's canary that persistence is
  broken).

---

## 20. Backend service (hosted API)

### API-1 — The generation endpoint

**Acceptance criteria:**

* Accepts: one drawing image (common raster formats — PNG/JPEG/WebP), capped in size
  *(reference: 15 MB)*, one credential (ACC-1), and an optional style identifier from the fixed
  set.
* The instruction given to the AI model is assembled **entirely service-side** from a fixed
  base instruction plus the allow-listed style's suffix; client-supplied text can never reach
  the model. Unknown styles contribute nothing.
* Distinct, machine-readable outcomes for: success (the image, marked never-cache), safety
  refusal, transient upstream failure, unauthorized, over-limit, and each input-validation
  failure (missing image / too large / unsupported type) — so clients can drive AI-4's UX.
* End-to-end request cap of 120 s enforced service-side as well as client-side.
* The service never stores the submitted drawing or the generated image.

### API-2 — Rate limiting as a cost guardrail

**As an** operator, **I want** hard per-minute caps on everything expensive or guessable, **so
that** a leaked code or a bot can't run up my bill before I notice.

**Acceptance criteria:**

* Sliding-window limits *(reference values)*:

  | Operation | Keyed by | Limit / min |
  |---|---|---|
  | Generation with a managed code | the code | 15 |
  | Generation with BYOK | caller address | 30 (roomy — several families may share one address) |
  | Access-code verification | caller address | 10 |
  | BYO-key verification | caller address | 10 |
  | Operator login (all doors combined) | caller address | 10 |

* Every unauthenticated operation that reveals anything (login, code check, key check, BYOK
  generation — whose success/failure leaks key validity) **must** be limited per caller address.
* Over-limit responses tell the truth: a standard too-many-requests result carrying the actual
  seconds until the caller is unblocked; rejected attempts do not extend the window.
* Limits may be best-effort (approximate under distributed/restart conditions) — they are a
  guardrail; the real defense is revocation (ACC-4). Limiter memory must be bounded.

### API-3 — Reachable by the apps, safe from the web

**Acceptance criteria:**

* The API is callable from the native apps' embedded origins and from the web app, and this
  openness is safe because **every** endpoint requires its own explicit per-request credential
  and **no** API endpoint ever relies on ambient browser credentials (cookies). The operator
  console's cookie flow lives outside the open API surface and is strictly same-site.
* Cross-site request forgery against any state-changing operation is impossible by
  construction (explicit credentials only).

### API-4 — Operability

**Acceptance criteria:**

* Every managed generation is logged with the code **masked** (e.g. last 4 characters only) —
  full secrets never appear in logs. BYOK generations log no per-user identity.
* Usage tallying is fire-and-forget: it never delays or fails a generation; concurrent
  increments from two devices are not lost (see PERS-4).
* Degrade, never throw: if durable storage is unavailable the service falls back (env-seeded
  allow-list, in-memory state), keeps serving, logs the condition, and surfaces it to the
  operator (ADM-3). A transient storage error affects one request, not all subsequent ones.
  A storage hiccup never turns a read (e.g. usage view) into an outage.
* Automated smoke checks can verify the auth flow and persistence round-trip against a real
  deployment before release.

---

## 21. Privacy & kids-compliance

### PRIV-1 — Collects nothing (binding, permanent)

**Acceptance criteria:**

* No analytics, no tracking, no advertising, no accounts, no third-party data-collecting SDKs,
  no in-app purchases, no social features, and no unrestricted external links in child-facing
  UI. This is the compliance baseline: it must remain true.
* The app requests only permissions it actually uses *(reference: network access; add-only
  photo saving)*, with honest, scoped permission copy ("save a screenshot of your drawing to
  your photo library").

### PRIV-2 — Data that leaves the device

**Acceptance criteria:**

* Exactly one flow sends anything off-device: an explicit AI request carries the current
  drawing image plus the credential. Nothing else, ever. The drawing is not used to identify
  anyone and is not retained (API-1).
* Saved pictures are written only to local device storage.

### PRIV-3 — Public privacy policy

**Acceptance criteria:**

* A public privacy-policy page at a stable URL on the product's site, reachable from the app's
  About area, stating: no ads, no tracking, no accounts, no analytics, no personal-data
  collection; works offline; drawings stay on the device; the optional AI feature's exact data
  flow and its anonymous per-code usage count for abuse prevention; child-data compliance
  (COPPA / GDPR-K); and a contact channel that itself collects no personal data.

### PRIV-4 — Store compliance

**Acceptance criteria:**

* The Android release satisfies the Play Families program: child age-band declaration,
  truthful data-safety disclosure, "Everyone" content rating, privacy-policy URL, minimal
  permissions.
* The iOS release satisfies the Kids Category: ages 5-and-under band, 4+ rating, no third-party
  analytics/advertising, truthful privacy nutrition label, and review notes explaining the
  Parent Center and the parent-enabled AI.
* **Open item (must be resolved before/at store submission):** whether outbound links (About →
  project/privacy) and the AI feature require a formal parental gate; if so, the Parent Center
  must be hardened into (or placed behind) a compliant gate.

### PRIV-5 — Accessibility posture

**Acceptance criteria:**

* Standard accessibility hygiene applies (labels, focus behavior, contrast, reduced-motion per
  SND-3), with one documented exception: viewport zoom is locked (TP-1), a deliberate
  toddler-safety trade-off accepted at the cost of platform zoom guidance.

---

## 22. Performance

### PERF-1 — Drawing feels like ink

**As a** child, **I want** the line to come out of my finger, **so that** drawing feels real.

**Acceptance criteria:**

* On representative low-end hardware (phone-class device, or an emulation ≈ 4× CPU slowdown),
  a standard "toddler session" (multi-finger scribbling, color/size changes, erasing, undo,
  clear) sustains **60 fps** with:
  * zero frames over 32 ms;
  * zero main-thread tasks over 50 ms;
  * zero forced synchronous layouts in the drawing path.
* On high-refresh displays the drawing path fits the native frame budget (e.g. 8.3 ms at
  120 Hz) *(reference)*.

### PERF-2 — Undo and rebuild stay cheap forever

**Acceptance criteria:**

* Undo cost is bounded by recent activity, not session length: after any amount of drawing, an
  undo (and a rotation/resize rebuild) completes imperceptibly (milliseconds-scale, never a
  visible stall).
* Undo memory does not grow linearly with steps as full-canvas snapshots (which would reach
  tens/hundreds of MB on tablets); pathological single strokes (thousands of samples) are
  compacted so they can't degrade later operations.
* Persisted stroke fidelity: any internal compaction/simplification is visually lossless
  *(reference: ≤ ~1.5 px deviation)*.

### PERF-3 — Fast first paint

**Acceptance criteria:**

* Measured on a slow profile (Slow-4G network + 4× CPU throttle, phone and tablet form
  factors): the canvas — the app's largest content — paints in low single-digit seconds on a
  first visit *(reference: LCP ≈ 1.9 s)*, and a repeat visit renders from local cache without
  the network.
* The initially served page is static/CDN-cacheable and identical for every user (no per-request
  server rendering of the child-facing app), with personalization (which controls show,
  drawer state) applied on-device **before first paint** — a returning user never sees a flash
  of wrong controls.
* Core Web Vitals (FCP/LCP/TBT/CLS) are tracked over releases; regressions are judged on trends.

### PERF-4 — Asset economy

**Acceptance criteria:**

* Picker grids never download full-resolution art (BOOK-4); moving from thumbnails to full art
  is prefetch-hidden. *(Reference effect: ~85 % transfer reduction across the picker.)*
* Images ship in efficient formats; vector art is optimized; total payloads stay tuned for the
  slow profile in PERF-3.

### PERF-5 — Measurability (ops requirement)

**Acceptance criteria:**

* A repeatable, deterministic performance harness can replay the standard toddler session and
  report the PERF-1 metrics on web, Android, and iOS, without instrumenting production builds
  (zero production overhead). Perf gating is run-on-demand trend analysis, not a flaky hard CI
  gate *(reference decision)*.

---

## 23. Operational cost

### COST-1 — Near-zero infrastructure

**Acceptance criteria:**

* The child-facing app is served as static content from a CDN — no server compute per
  visit/load.
* Service-side state is tiny key-value data (PERS-4) — no managed database, no per-user server
  storage, no stored media.
* The only per-use marginal cost is AI generation, and it is bounded by: gating (ACC-1), rate
  limits (API-2), immediate revocation (ACC-4), a deliberately cheap/fast model tier
  *(reference)*, minimal-cost key-verification probes (ACC-2), and BYOK shifting cost to the
  parent's own account.

---

## 24. Explicit non-requirements & known gaps

To prevent over-building, the following are **not** requirements of the current product:

* **No redo** (undo only), **no share sheet**, **no in-app gallery**, and **no restoring a
  drawing after the app closes** (PERS-2) — all deliberate.
* **No free-text AI prompting** by users — deliberate (safety + cost).
* **No parental gate** on the Parent Center today (open compliance question, PRIV-4).
* **No cross-device sync or accounts** — deliberate (P-2).
* **Single shared codebase, specific hosting, specific AI vendor** — implementation choices,
  not requirements.
* Backlog (aspirations, not shipped): zoomable/bigger AI result preview, immediate AI retry
  affordance, custom parent-authored AI styles, coloring-page favorites, user-supplied
  coloring-book bundles, brush blend modes, delete sound effects, marketing/about download
  page, automated store deployment, richer loading entertainment, deep links that auto-apply
  an access code, hardware back-button handling, additional layout polish on specific devices.

---

*Traceability: this document was distilled from the shipped behavior of the Splotch codebase
(including its ADRs, which record implementation decisions; only their underlying
product-level constraints are carried here). When shipped behavior changes, update the relevant
stories in the same change.*
