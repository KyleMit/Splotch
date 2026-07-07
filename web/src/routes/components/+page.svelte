<script lang="ts">
  import { onMount } from 'svelte';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import ColorPalette from '$lib/components/ColorPalette.svelte';
  import ColorPicker from '$lib/components/ColorPicker.svelte';
  import FullscreenToggle from '$lib/components/FullscreenToggle.svelte';
  import NotchBand from '$lib/components/NotchBand.svelte';
  import ClearButton from '$lib/components/ClearButton.svelte';
  import ActionsPanel from '$lib/components/ActionsPanel.svelte';
  import ColoringBook from '$lib/components/ColoringBook.svelte';
  import InstallBanner from '$lib/components/InstallBanner.svelte';
  import ParentHelpButton from '$lib/components/ParentHelpButton.svelte';
  import ParentCenter from '$lib/components/ParentCenter.svelte';
  import AiImagePrompt from '$lib/components/AiImagePrompt.svelte';
  import AiImageResult from '$lib/components/AiImageResult.svelte';
  import AiDial from '$lib/components/AiDial.svelte';
  import AiConfetti from '$lib/components/AiConfetti.svelte';
  import ErrorScreen from '$lib/components/ErrorScreen.svelte';
  import Slider from '$lib/components/Slider.svelte';
  import TabPager from '$lib/components/TabPager.svelte';
  import TabPagerTab from '$lib/components/TabPagerTab.svelte';
  import ToggleRow from '$lib/components/parent/ToggleRow.svelte';
  import AdminConsole from '$lib/components/admin/AdminConsole.svelte';
  import Icon, { ICON_NAMES, COLOR_ICONS } from '$lib/components/Icon.svelte';
  import { colors } from '$lib/state/colors.svelte';
  import { toolState } from '$lib/state/tool.svelte';
  import { fullscreen } from '$lib/state/fullscreen.svelte';
  import { install } from '$lib/state/install.svelte';
  import { canvasState } from '$lib/state/canvas.svelte';
  import drawingShot from './drawing-canvas.jpg';
  import coloringShot from './coloring-page.jpg';

  const spotIcons = ICON_NAMES.filter((name) => COLOR_ICONS.has(name));
  const monoIcons = ICON_NAMES.filter((name) => !COLOR_ICONS.has(name));

  // Seed the runtime-gated states these demos need: the Fullscreen Toggle only
  // renders when the platform supports element fullscreen, and the Install
  // Banner waits for an installable browser plus a few strokes.
  onMount(() => {
    fullscreen.supported = true;
    if (install.mode === 'none') install.mode = 'ios';
    canvasState.strokeCount = Math.max(canvasState.strokeCount, 3);
  });

  const notchDemoColor = $derived(toolState.eraser ? '#fcfbf8' : colors.activeColor);

  // The Clear Button's drag states are applied imperatively by the dragToClear
  // action mid-gesture; these toggles flip the same classes so the states can
  // be inspected without dragging.
  let clearStageEl: HTMLElement;
  let clearDragging = $state(false);
  let clearReady = $state(false);
  $effect(() => {
    const button = clearStageEl?.querySelector('#clearButton');
    button?.classList.toggle('dragging', clearDragging || clearReady);
    button?.classList.toggle('delete-ready', clearReady);
  });

  let dialProgress = $state(0.66);
  let sliderValue = $state(50);
  let toggleOn = $state(true);
  let toggleOff = $state(false);

  const demoInvites = [
    {
      token: 'grandma',
      url: 'https://splotch.art/?token=grandma',
      usage: {
        count: 12,
        firstUsed: '2026-05-14T09:30:00Z',
        lastUsed: '2026-07-05T16:20:00Z',
        lastStyle: 'Crayon',
        lastPrompt: 'A happy dinosaur eating spaghetti',
      },
    },
    { token: 'preschool-pals', url: 'https://splotch.art/?token=preschool-pals', usage: null },
  ];
  const demoNoop = async () => {};
  const demoAccept = async () => true;
</script>

<svelte:head>
  <title>Components · Splotch</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="catalog-page">
  <main class="catalog">
    <Breadcrumb current="Components" />

    <header class="catalog-header">
      <span class="catalog-badge"
        ><Icon name="dashboard-customize" class="catalog-badge-icon" /></span
      >
      <div>
        <h1>Components</h1>
        <p class="subtitle">
          Live catalog of every UI component, following the UI Elements glossary in the
          <code>architecture</code> skill
        </p>
      </div>
    </header>

    <p class="catalog-note">
      Demos are the real components wired to the app's real state — selecting a color here selects
      it everywhere on this page (and in the drawing app, if you navigate to it). Modals are shown
      with their <code>&lt;dialog&gt;</code> element rendered in the normal document flow instead of the
      browser's top layer.
    </p>

    <h2 id="canvas-chrome">Canvas &amp; chrome</h2>

    <section class="demo">
      <div class="demo-head">
        <h3>Color Palette</h3>
        <code>ColorPalette.svelte</code>
      </div>
      <p>
        Container bar holding all <strong>Color Swatches</strong>. Top-edge row in portrait,
        left-edge column in landscape. The active swatch carries the <strong>Selection Ring</strong>
        (tap one to move it), and the final <strong>Gradient Swatch</strong> (artist's palette icon) opens
        the custom Color Picker.
      </p>
      <div class="stage stage-palette">
        <ColorPalette />
      </div>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>Drawing Canvas</h3>
        <code>DrawingCanvas.svelte</code>
      </div>
      <p>
        The main touch-responsive drawing surface. It owns the imperative canvas engine
        (module-level undo history, pointer tracking), so it can't be mounted as an inert demo —
        these screenshots are generated from the live app by <code>npm run gen:component-shots</code
        >.
      </p>
      <div class="shot-row">
        <figure>
          <img src={drawingShot} alt="Drawing Canvas with a freehand rainbow scene drawn on it" />
          <figcaption>Freehand strokes</figcaption>
        </figure>
        <figure>
          <img
            src={coloringShot}
            alt="Drawing Canvas with a coloring page overlay applied and magic brush strokes"
          />
          <figcaption>Coloring Page Overlay + Magic Brush strokes</figcaption>
        </figure>
      </div>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>Fullscreen Toggle</h3>
        <code>FullscreenToggle.svelte</code>
      </div>
      <p>
        Subtle top-left corner button that enters/exits immersive fullscreen (Android web only in
        production — support is forced on for this demo). The icon flips between expand and minimize
        with the active state.
      </p>
      <div class="stage stage-corner">
        <FullscreenToggle />
      </div>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>Notch Band</h3>
        <code>NotchBand.svelte</code>
      </div>
      <p>
        Thin strip filling the device's top safe-area inset, painted with the active drawing color
        (paper-white while erasing). Invisible on devices without a cutout — this demo forces a
        height and mirrors the live color: pick a different swatch above and it follows.
      </p>
      <div class="stage stage-notch" style="--notch-demo-color: {notchDemoColor};">
        <NotchBand />
      </div>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>Clear Button</h3>
        <code>ClearButton.svelte</code>
      </div>
      <p>
        Floating trash button docked to the right edge; drag it toward the canvas to clear. The drag
        states (open lid, round shape, red <em>delete-ready</em> glow) are applied by the
        <code>dragToClear</code> action mid-gesture — the toggles below flip the same classes. The Clear
        Accept Zone ring, Clear Preview wash, and Page Turn Overlay only appear during a real drag.
      </p>
      <div class="demo-controls">
        <label><input type="checkbox" bind:checked={clearDragging} /> Dragging</label>
        <label><input type="checkbox" bind:checked={clearReady} /> Delete ready</label>
      </div>
      <div class="stage stage-clear" bind:this={clearStageEl}>
        <ClearButton />
      </div>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>Actions Panel</h3>
        <code>ActionsPanel.svelte</code>
      </div>
      <p>
        Bottom-corner drawer hosting the auxiliary controls: Stroke Width Button (with its size
        flyout), Eraser, Coloring Book Button, Magic Brush Button, Screenshot Button, AI button, and
        Undo Button, plus the chevron drawer toggle. The drawer is forced open here (and the AI
        button forced visible); Undo and Screenshot show their disabled state because the canvas is
        empty. Eraser and Magic Brush toggle for real.
      </p>
      <div class="stage stage-actions">
        <ActionsPanel />
      </div>
    </section>

    <h2 id="modals-overlays">Modals &amp; overlays</h2>

    <section class="demo">
      <div class="demo-head">
        <h3>Color Picker Overlay</h3>
        <code>ColorPicker.svelte</code>
      </div>
      <p>
        Full-screen modal opened by the Gradient Swatch. The <strong>Hexagon Grid</strong> holds 9
        hue families × 9 shades of <strong>Color Hexagons</strong>; both the portrait and landscape
        arrangements are always rendered and CSS picks one per orientation. Tapping a hexagon
        selects it for real (watch the Gradient Swatch in the palette above).
      </p>
      <div class="stage-modal">
        <ColorPicker />
      </div>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>Coloring Book Picker</h3>
        <code>ColoringBook.svelte</code>
      </div>
      <p>
        Modal for choosing a coloring page overlay: the <strong>Coloring Book Grid</strong> of cover
        tiles, then a book's <strong>Coloring Page Grid</strong>. Fully interactive — note that
        picking a page genuinely applies it as the app's canvas overlay.
      </p>
      <div class="stage-modal">
        <ColoringBook />
      </div>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>Install Banner</h3>
        <code>InstallBanner.svelte</code>
      </div>
      <p>
        Bottom-center pill prompting "Add Splotch to your home screen", shown on web after a few
        strokes (both conditions are seeded for this demo). One-tap install on Chromium; guided hint
        elsewhere — "How?" expands the manual steps. Dismissing it here is remembered, exactly like
        in the app.
      </p>
      <div class="stage stage-banner">
        <InstallBanner />
      </div>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>Parent Help Button</h3>
        <code>ParentHelpButton.svelte</code>
      </div>
      <p>
        Muted bottom-right corner button that opens the Parent Center. Shares the
        <code>.corner-button</code> chrome with the Fullscreen Toggle and drawer toggle.
      </p>
      <div class="stage stage-corner">
        <ParentHelpButton />
      </div>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>Parent Center</h3>
        <code>ParentCenter.svelte</code>
      </div>
      <p>
        The parent-facing modal: Settings (<code>parent/SettingsToggles.svelte</code>), AI key
        manager (<code>parent/AiKeyManager.svelte</code>), Setup install guide (<code
          >parent/SetupInstructions.svelte</code
        >), and About (<code>parent/AboutTab.svelte</code>), paged by the Tab Pager. The tabs are
        fully live — flipping a toggle here changes the real persisted setting.
      </p>
      <div class="stage-modal">
        <ParentCenter />
      </div>
    </section>

    <h2 id="ai-flow">AI image flow</h2>

    <section class="demo">
      <div class="demo-head">
        <h3>AI Image Prompt</h3>
        <code>AiImagePrompt.svelte</code>
      </div>
      <p>
        Style picker shown before generation. The style tiles stay disabled until a canvas export
        provides the drawing preview, so this demo shows the disabled state.
      </p>
      <div class="stage-modal">
        <AiImagePrompt />
      </div>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>AI Image Result</h3>
        <code>AiImageResult.svelte</code>
      </div>
      <p>
        Generation progress and reveal modal, resting in its loading state: the placeholder stage
        with the progress dial and confetti layer. In the app the child's blurred drawing sits
        behind the dial and sharpens as progress climbs.
      </p>
      <div class="stage-modal">
        <AiImageResult />
      </div>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>AI Dial</h3>
        <code>AiDial.svelte</code>
      </div>
      <p>Standalone progress dial, held at 66% via its <code>progress</code> prop.</p>
      <div class="stage stage-ai">
        <div class="dial-box">
          <AiDial progress={dialProgress} />
        </div>
      </div>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>AI Confetti</h3>
        <code>AiConfetti.svelte</code>
      </div>
      <p>
        Falling confetti layer that celebrates while generation runs, with a circular mask hole
        where the dial sits.
      </p>
      <div class="stage stage-ai stage-confetti">
        <AiConfetti />
      </div>
    </section>

    <h2 id="primitives">Primitives</h2>

    <section class="demo">
      <div class="demo-head">
        <h3>Slider</h3>
        <code>Slider.svelte</code>
      </div>
      <p>
        Relative-drag slider (grab anywhere and slide; the value moves by distance travelled) with
        an optional magnetic snap detent — marked by the tick at 50 here.
      </p>
      <div class="demo-surface">
        <span id="slider-demo-label" class="demo-label">Demo value: {sliderValue}%</span>
        <Slider
          value={sliderValue}
          labelId="slider-demo-label"
          valueText="{sliderValue}%"
          snap={50}
          onInput={(v) => (sliderValue = v)}
        />
      </div>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>Tab Pager</h3>
        <span><code>TabPager.svelte</code> + <code>TabPagerTab.svelte</code></span>
      </div>
      <p>
        Swipeable tab panels with an underline that tracks the scroll position. Used by the Parent
        Center; tap the tabs or swipe the panels.
      </p>
      <div class="demo-surface">
        <TabPager initialTab="first" ariaLabel="Tab Pager demo">
          {#snippet tabs()}
            <TabPagerTab id="first" label="Settings" icon="settings" />
            <TabPagerTab id="second" label="Setup" icon="pin" />
            <TabPagerTab id="third" label="About" icon="splotchy" />
          {/snippet}
          {#snippet children(tabId)}
            <p class="demo-panel">Panel content for <strong>{tabId}</strong></p>
          {/snippet}
        </TabPager>
      </div>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>Toggle Row</h3>
        <code>parent/ToggleRow.svelte</code>
      </div>
      <p>Labelled switch row used throughout the Parent Center settings, in each state.</p>
      <div class="demo-surface demo-toggles">
        <ToggleRow
          icon="volume-on"
          label="On"
          id="demo-toggle-on"
          checked={toggleOn}
          onToggle={(next) => (toggleOn = next)}
          help="With optional help text below the row"
        />
        <ToggleRow
          icon="volume-off"
          label="Off"
          id="demo-toggle-off"
          checked={toggleOff}
          onToggle={(next) => (toggleOff = next)}
        />
        <ToggleRow
          icon="lock"
          label="Disabled"
          id="demo-toggle-disabled"
          checked={false}
          onToggle={() => {}}
          disabled
        />
      </div>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>Breadcrumb</h3>
        <code>Breadcrumb.svelte</code>
      </div>
      <p>Home trail used by the document-style pages (Admin, and this catalog).</p>
      <div class="demo-surface">
        <Breadcrumb current="Example page" />
      </div>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>Error Screen</h3>
        <code>ErrorScreen.svelte</code>
      </div>
      <p>
        Dependency-light crash fallback shared by the SvelteKit error page and the layout's render
        boundary. The button navigates home for real.
      </p>
      <div class="stage stage-error">
        <ErrorScreen />
      </div>
    </section>

    <h2 id="icons">Icons</h2>
    <p>
      All {ICON_NAMES.length} icons in <code>src/lib/icons/</code>, rendered through
      <code>Icon.svelte</code> (<code>&lt;Icon name="…" /&gt;</code>, type-checked against the
      generated <code>IconName</code> union).
    </p>

    <section class="demo">
      <div class="demo-head">
        <h3>Spot icons (full color)</h3>
        <code>COLOR_ICONS</code>
      </div>
      <p>
        Icons that carry their own palette and opt out of the monochrome tint filters (tagged
        <code>.icon-color</code>). The <code>size-*</code> line icons are here too: they draw with
        <code>currentColor</code> — purple in this demo — so they preview the active pen color.
      </p>
      <div class="icon-grid">
        {#each spotIcons as name (name)}
          <div class="icon-tile icon-tile-spot">
            <Icon {name} class="icon-demo" />
            <code>{name}</code>
          </div>
        {/each}
      </div>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>Monochrome icons (black &amp; white)</h3>
      </div>
      <p>
        Single-color glyphs, recolored in context by CSS <code>filter</code> chains (gray corner buttons,
        brand-purple active states, white-on-dark badges).
      </p>
      <div class="icon-grid">
        {#each monoIcons as name (name)}
          <div class="icon-tile">
            <Icon {name} class="icon-demo" />
            <code>{name}</code>
          </div>
        {/each}
      </div>
    </section>

    <h2 id="admin">Admin</h2>

    <section class="demo">
      <div class="demo-head">
        <h3>Admin Console — signed out</h3>
        <code>admin/AdminConsole.svelte</code>
      </div>
      <p>
        Presentational shell shared by <code>/admin</code> (cookie session) and
        <code>/admin/native</code> (bearer session). Signed-out state shows the login card. Demo callbacks
        accept anything — nothing is submitted.
      </p>
      <div class="stage stage-admin stage-admin-short">
        <AdminConsole
          authed={false}
          invites={[]}
          onlogin={demoAccept}
          onlogout={demoNoop}
          onadd={demoAccept}
          onremove={demoNoop}
        />
      </div>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>Admin Console — signed in</h3>
        <code>admin/AdminConsole.svelte</code>
      </div>
      <p>
        Authenticated state with sample data: a used code (with its usage tally), a never-used code,
        a success flash, and the non-persistent Blobs warning.
      </p>
      <div class="stage stage-admin">
        <AdminConsole
          authed={true}
          invites={demoInvites}
          persistent={false}
          flash={{ kind: 'success', text: 'Added "preschool-pals".' }}
          onlogin={demoAccept}
          onlogout={demoNoop}
          onadd={demoAccept}
          onremove={demoNoop}
        />
      </div>
    </section>
  </main>
</div>

<style>
  /* The global app.css locks the body (no scroll, no text selection) for the
     drawing canvas. Like /admin, this page is a normal document, so it opts
     back in. */
  .catalog-page {
    position: fixed;
    inset: 0;
    overflow-y: auto;
    background: #f5f5f5;
    -webkit-user-select: text;
    user-select: text;
    -webkit-overflow-scrolling: touch;
  }

  .catalog {
    max-width: 880px;
    margin: 0 auto;
    padding: clamp(20px, 5vw, 48px) 16px 64px;
    font-family: 'Quicksand Variable', 'Quicksand', sans-serif;
    color: #333;
  }

  .catalog-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 20px;
  }

  .catalog-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    border-radius: 16px;
    background: linear-gradient(135deg, var(--brand), #7c4dcf);
    box-shadow: 0 6px 16px rgba(124, 77, 207, 0.35);
    flex-shrink: 0;
  }

  :global(.catalog-badge .catalog-badge-icon) {
    width: 30px;
    height: 30px;
    filter: brightness(0) invert(1);
  }

  h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .subtitle {
    margin: 2px 0 0;
    color: #888;
    font-size: 15px;
    font-weight: 500;
  }

  .catalog-note {
    margin: 0 0 12px;
    padding: 12px 16px;
    border-radius: 12px;
    background: #f0e9fb;
    color: #5b3d91;
    font-size: 14px;
    line-height: 1.5;
  }

  h2 {
    margin: 40px 0 4px;
    font-size: 22px;
    font-weight: 700;
    color: #444;
    border-bottom: 2px solid #e8e2d8;
    padding-bottom: 6px;
  }

  h2 + p {
    margin: 8px 0 0;
    font-size: 14px;
    color: #666;
    line-height: 1.5;
  }

  .demo {
    background: #fff;
    border-radius: 16px;
    padding: 20px 24px 24px;
    margin-top: 20px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
  }

  .demo-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .demo-head h3 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
  }

  code {
    font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
    font-size: 0.85em;
    background: #f4f0ea;
    padding: 2px 6px;
    border-radius: 6px;
    color: #6b5d8f;
  }

  .demo p {
    margin: 8px 0 0;
    font-size: 14px;
    color: #666;
    line-height: 1.55;
  }

  .demo-controls {
    display: flex;
    gap: 20px;
    margin-top: 12px;
    font-size: 14px;
    font-weight: 600;
    color: #555;
  }

  .demo-controls label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  /* Demo viewport: `contain: layout` makes the stage the containing block for
     the components' position: fixed chrome, so corner buttons, banners, and
     panels anchor to the stage instead of the real viewport. */
  .stage {
    position: relative;
    contain: layout;
    overflow: hidden;
    margin-top: 16px;
    min-height: 140px;
    background:
      linear-gradient(rgba(252, 251, 248, 0.94), rgba(252, 251, 248, 0.94)),
      repeating-conic-gradient(#e9e4da 0% 25%, transparent 0% 50%) 0 0 / 24px 24px;
    border: 1px dashed #d8d0c2;
    border-radius: 12px;
  }

  .stage-palette {
    display: flex;
    justify-content: center;
    padding: 16px;
    contain: none;
    overflow-x: auto;
  }

  .stage-corner {
    min-height: 120px;
  }

  .stage-notch {
    min-height: 80px;
  }

  /* On a real device the band hugs whichever edge holds the cutout and is only
     as thick as the safe-area inset (0 on desktop) — pin it to the stage's top
     edge with a visible height so there's something to look at. */
  .stage-notch :global(.notch-band) {
    inset: 0 0 auto 0 !important;
    width: auto !important;
    height: 32px !important;
    background-color: var(--notch-demo-color, #444) !important;
  }

  .stage-clear {
    min-height: 220px;
  }

  .stage-actions {
    min-height: 200px;
  }

  /* Hold the drawer open and reveal the (normally token-gated) AI button so
     every control is inspectable, whatever the visitor's stored settings say. */
  .stage-actions :global(.actions-drawer) {
    grid-template-columns: 1fr !important;
    grid-template-rows: 1fr !important;
    opacity: 1 !important;
    visibility: visible !important;
    pointer-events: auto !important;
  }

  .stage-actions :global(.actions-drawer-inner) {
    overflow: visible !important;
  }

  .stage-actions :global(#aiImageButton[hidden]) {
    display: flex !important;
  }

  .stage-banner {
    min-height: 220px;
  }

  .stage-ai {
    min-height: 260px;
    background: #2b2438;
  }

  /* AiDial fills its nearest positioned ancestor (in the app, the result
     modal's stage), so give it a fixed-size box to inhabit. */
  .dial-box {
    position: relative;
    width: 220px;
    height: 220px;
    margin: 20px auto;
  }

  .stage-confetti {
    min-height: 220px;
  }

  .stage-error {
    min-height: 320px;
  }

  .stage-admin {
    min-height: 640px;
    contain: strict;
    height: 640px;
  }

  .stage-admin-short {
    min-height: 420px;
    height: 420px;
  }

  /* Modal demos: the components are real <dialog> modals, normally opened into
     the top layer by showModal() (via the modalDialog action). Overriding the
     UA's `dialog:not([open]) { display: none }` renders the same card in the
     normal document flow instead — the dialog never "opens", so the action's
     open/close $effect stays inert and its close buttons are no-ops here. */
  .stage-modal {
    margin-top: 16px;
  }

  .stage-modal :global(dialog) {
    display: block;
    position: static;
    transform: none;
    margin: 0 auto;
    animation: none;
    box-shadow:
      0 0 0 1px #e8e2d8,
      0 8px 32px rgba(0, 0, 0, 0.12);
  }

  .shot-row {
    display: flex;
    gap: 16px;
    margin-top: 16px;
    flex-wrap: wrap;
  }

  .shot-row figure {
    flex: 1 1 280px;
    margin: 0;
  }

  .shot-row img {
    width: 100%;
    height: auto;
    border-radius: 12px;
    border: 1px solid #e8e2d8;
    display: block;
  }

  .shot-row figcaption {
    margin-top: 6px;
    font-size: 13px;
    color: #888;
    text-align: center;
  }

  .demo-surface {
    margin-top: 16px;
    padding: 16px;
    background: #f8f8f8;
    border-radius: 12px;
  }

  .demo-label {
    display: block;
    font-size: 14px;
    font-weight: 600;
    color: #555;
    margin-bottom: 10px;
  }

  .demo-toggles {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .demo-panel {
    padding: 20px 8px;
    text-align: center;
    color: #666;
  }

  .icon-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: 10px;
    margin-top: 16px;
  }

  .icon-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 14px 6px 10px;
    background: #fcfbf8;
    border: 1px solid #eee8dd;
    border-radius: 10px;
    text-align: center;
  }

  .icon-tile code {
    background: none;
    padding: 0;
    font-size: 11px;
    color: #777;
    word-break: break-all;
  }

  .icon-tile :global(.icon-demo) {
    width: 32px;
    height: 32px;
  }

  /* Give the currentColor size-* line icons a visible pen color. */
  .icon-tile-spot {
    color: var(--brand);
  }
</style>
