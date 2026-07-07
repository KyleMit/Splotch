<script lang="ts">
  import { onMount } from 'svelte';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import ColorPalette from '$lib/components/ColorPalette.svelte';
  import FullscreenToggle from '$lib/components/FullscreenToggle.svelte';
  import NotchBand from '$lib/components/NotchBand.svelte';
  import ClearButton from '$lib/components/ClearButton.svelte';
  import ActionsPanel from '$lib/components/ActionsPanel.svelte';
  import ColoringBookContent from '$lib/components/ColoringBookContent.svelte';
  import InstallBanner from '$lib/components/InstallBanner.svelte';
  import ParentHelpButton from '$lib/components/ParentHelpButton.svelte';
  import ParentCenterContent from '$lib/components/ParentCenterContent.svelte';
  import AiImagePromptContent from '$lib/components/AiImagePromptContent.svelte';
  import AiDial from '$lib/components/AiDial.svelte';
  import AiConfetti from '$lib/components/AiConfetti.svelte';
  import ErrorScreen from '$lib/components/ErrorScreen.svelte';
  import Slider from '$lib/components/Slider.svelte';
  import TabPager from '$lib/components/TabPager.svelte';
  import TabPagerTab from '$lib/components/TabPagerTab.svelte';
  import ToggleRow from '$lib/components/parent/ToggleRow.svelte';
  import Icon, { ICON_NAMES, COLOR_ICONS } from '$lib/components/Icon.svelte';
  import { modalDialog } from '$lib/actions/modalDialog.svelte';
  import { ui, buttonCenter } from '$lib/state/ui.svelte';
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
    canvasState.strokeCount = Math.max(canvasState.strokeCount, 3);
    if (install.mode !== 'none') installDemoMode = install.mode;
    setInstallDemo(installDemoMode);
  });

  // The banner branches on install.mode (ADR-0039): 'oneTap' when Chromium
  // fired beforeinstallprompt, or the 'ios'/'android' manual-steps hints. The
  // radios drive the real state so every branch is inspectable regardless of
  // what browser is viewing this page; re-picking also clears an in-memory
  // dismissal so the banner comes back after trying the × button.
  let installDemoMode = $state<'oneTap' | 'ios' | 'android'>('ios');
  function setInstallDemo(mode: 'oneTap' | 'ios' | 'android') {
    installDemoMode = mode;
    install.mode = mode;
    install.installed = false;
    install.dismissed = false;
  }

  // Some demos' buttons call the app's real open* setters (Parent Help Button,
  // the Actions Panel's coloring-book button, the palette's gradient swatch),
  // but this page mounts no modal dialogs — clear the flags so a later
  // client-side navigation into the drawing app doesn't open a modal there.
  $effect(() => {
    if (ui.parentCenterOpen) ui.parentCenterOpen = false;
    if (ui.colorPickerOpen) ui.colorPickerOpen = false;
    if (ui.coloringBookOpen) ui.coloringBookOpen = false;
    if (ui.aiPromptOpen) ui.aiPromptOpen = false;
  });

  const notchDemoColor = $derived(toolState.eraser ? '#fcfbf8' : colors.activeColor);

  // The Clear Button's drag states are applied imperatively by the dragToClear
  // action mid-gesture; these toggles flip the same classes (and place the
  // accept-zone ring the way the action does) so the states can be inspected
  // without dragging.
  let clearStageEl: HTMLElement;
  let clearDragging = $state(false);
  let clearReady = $state(false);
  let clearZoneShown = $state(false);
  $effect(() => {
    const button = clearStageEl?.querySelector('#clearButton');
    button?.classList.toggle('dragging', clearDragging || clearReady);
    button?.classList.toggle('delete-ready', clearReady);
  });
  $effect(() => {
    const zone = clearStageEl?.querySelector<HTMLElement>('#clearAcceptZone');
    const button = clearStageEl?.querySelector<HTMLElement>('#clearButton');
    if (!zone || !button) return;
    if (clearZoneShown) {
      // Same geometry as dragToClear: a ring centered on the button's home
      // position — the stage's transform makes its fixed coords stage-relative,
      // so measure the button relative to the stage.
      const stageRect = clearStageEl.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const cx = buttonRect.left + buttonRect.width / 2 - stageRect.left;
      const cy = buttonRect.top + buttonRect.height / 2 - stageRect.top;
      const radius = Math.min(stageRect.width, stageRect.height) * 0.55;
      zone.style.left = `${cx - radius}px`;
      zone.style.top = `${cy - radius}px`;
      zone.style.width = `${radius * 2}px`;
      zone.style.height = `${radius * 2}px`;
      zone.style.display = 'block';
      requestAnimationFrame(() => zone.classList.add('visible'));
    } else {
      zone.classList.remove('visible');
      zone.style.display = 'none';
    }
  });
  $effect(() => {
    const zone = clearStageEl?.querySelector<HTMLElement>('#clearAcceptZone');
    zone?.classList.toggle('threshold-reached', clearZoneShown && clearReady);
  });

  let exampleModalOpen = $state(false);
  let exampleModalBtn = $state<HTMLButtonElement>();

  let dialProgress = $state(0.66);
  let sliderValue = $state(50);
  let toggleOn = $state(true);
  let toggleOff = $state(false);
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
      it everywhere on this page (and in the drawing app, if you navigate to it). Modal
      <em>contents</em> are rendered directly in the page flow; the modal chrome itself has its own demo
      under Modals &amp; overlays.
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
        (tap one to move it), and the final <strong>Gradient Swatch</strong> (artist's palette icon)
        opens the custom Color Picker. Its layout and swatch-trim ladders are container queries
        against its room (<code>splotch-app</code>) — drag the stage's corner handle to watch it
        re-lay-out, reveal bonus colors when tall, and trim swatches when cramped.
      </p>
      <div class="resize-stage palette-stage" title="Drag the bottom-right corner to resize">
        <div class="palette-stage-inner">
          <ColorPalette />
          <div class="stage-paper"></div>
        </div>
      </div>
      <p class="resize-hint">
        Resizable with a mouse — drag the handle in the bottom-right corner.
      </p>
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
        states (open lid, round shape, the <strong>Clear Accept Zone</strong> ring, the red
        <em>delete-ready</em> glow) are applied by the <code>dragToClear</code> action mid-gesture — the
        toggles below flip the same classes. The Clear Preview wash and Page Turn Overlay only appear
        during a real drag.
      </p>
      <div class="demo-controls">
        <label><input type="checkbox" bind:checked={clearDragging} /> Dragging</label>
        <label><input type="checkbox" bind:checked={clearZoneShown} /> Accept zone</label>
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
        <h3>Modal Shell</h3>
        <span><code>modal-shell</code> + <code>actions/modalDialog.svelte.ts</code></span>
      </div>
      <p>
        Every modal in the app is a native <code>&lt;dialog&gt;</code> sharing the same treatment:
        the <code>.modal-shell</code> centered white card, the dimmed blurred backdrop, a fly-in
        from the button that opened it, Esc/backdrop-tap dismissal, and the toddler launch-zone
        guard — all wired by the <code>modalDialog</code> action. This one empty example opens for
        real; the demos below show each modal's <em>contents</em> in the page flow instead.
      </p>
      <button
        type="button"
        class="open-modal-button"
        bind:this={exampleModalBtn}
        onclick={() => (exampleModalOpen = true)}
      >
        Open example modal
      </button>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>Color Picker Overlay</h3>
        <span><code>ColorPicker.svelte</code> → <code>ColorPickerContent.svelte</code></span>
      </div>
      <p>
        Full-screen modal opened by the Gradient Swatch. The <strong>Hexagon Grid</strong> holds 9
        hue families × 9 shades of <strong>Color Hexagons</strong>; both the portrait and landscape
        arrangements are always rendered and CSS picks one per orientation, trimming shades on the
        short axis and families on the long one. Its room is the whole viewport, so this demo runs
        in its own resizable <code>&lt;iframe&gt;</code> — drag the corner handle to walk the trim ladders
        and flip orientations. The frame is an isolated instance: picks inside it don't change this page's
        color.
      </p>
      <div class="resize-stage picker-stage" title="Drag the bottom-right corner to resize">
        <iframe src="/components/frame/picker" title="Color Picker at a custom viewport size"
        ></iframe>
      </div>
      <p class="resize-hint">
        Resizable with a mouse — drag the handle in the bottom-right corner.
      </p>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>Coloring Book Picker</h3>
        <span><code>ColoringBook.svelte</code> → <code>ColoringBookContent.svelte</code></span>
      </div>
      <p>
        Modal content for choosing a coloring page overlay: the
        <strong>Coloring Book Grid</strong> of cover tiles, then a book's
        <strong>Coloring Page Grid</strong>. Fully interactive — note that picking a page genuinely
        applies it as the app's canvas overlay.
      </p>
      <div class="modal-card modal-card-wide">
        <ColoringBookContent />
      </div>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>Install Banner</h3>
        <code>InstallBanner.svelte</code>
      </div>
      <p>
        Bottom-center pill prompting "Add Splotch to your home screen", shown on web after a few
        strokes. Which call-to-action it offers branches on the device setup (ADR-0039) — pick one
        to preview it: Chromium's captured install prompt shows a one-tap <em>Install</em> button,
        while iOS Safari and other Android browsers get a <em>How?</em> button that expands that
        platform's manual steps. (There's no real captured prompt on this page, so tapping
        <em>Install</em> falls back the same way a stale prompt does in the app; dismissing with × is
        remembered like in the app — re-pick a setup to bring the banner back.)
      </p>
      <div class="demo-controls" role="radiogroup" aria-label="Install Banner device setup">
        <label>
          <input
            type="radio"
            name="install-demo-mode"
            checked={installDemoMode === 'oneTap'}
            onchange={() => setInstallDemo('oneTap')}
          />
          One-tap prompt (Chromium)
        </label>
        <label>
          <input
            type="radio"
            name="install-demo-mode"
            checked={installDemoMode === 'ios'}
            onchange={() => setInstallDemo('ios')}
          />
          iOS Safari
        </label>
        <label>
          <input
            type="radio"
            name="install-demo-mode"
            checked={installDemoMode === 'android'}
            onchange={() => setInstallDemo('android')}
          />
          Android browser
        </label>
      </div>
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
        Muted bottom-right corner button that opens the Parent Center in the app (inert here — this
        page mounts no modals). Shares the <code>.corner-button</code> chrome with the Fullscreen Toggle
        and drawer toggle.
      </p>
      <div class="stage stage-corner">
        <ParentHelpButton />
      </div>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>Parent Center</h3>
        <span><code>ParentCenter.svelte</code> → <code>ParentCenterContent.svelte</code></span>
      </div>
      <p>
        The parent-facing modal content: Settings (<code>parent/SettingsToggles.svelte</code>), AI
        key manager (<code>parent/AiKeyManager.svelte</code>), Setup install guide (<code
          >parent/SetupInstructions.svelte</code
        >), and About (<code>parent/AboutTab.svelte</code>), paged by the Tab Pager. The tabs are
        fully live — flipping a toggle here changes the real persisted setting.
      </p>
      <div class="modal-card modal-card-narrow">
        <ParentCenterContent />
      </div>
    </section>

    <h2 id="ai-flow">AI image flow</h2>

    <section class="demo">
      <div class="demo-head">
        <h3>AI Image Prompt</h3>
        <span><code>AiImagePrompt.svelte</code> → <code>AiImagePromptContent.svelte</code></span>
      </div>
      <p>
        Style picker shown before generation. The style tiles stay disabled until a canvas export
        provides the drawing preview, so this demo shows the disabled state.
      </p>
      <div class="modal-card modal-card-narrow prompt-card">
        <AiImagePromptContent previewUrl={null} onSelectStyle={() => {}} />
      </div>
    </section>

    <section class="demo">
      <div class="demo-head">
        <h3>AI Image Result</h3>
        <code>AiImageResult.svelte</code>
      </div>
      <p>
        Generation progress and reveal modal: the child's blurred drawing behind the progress dial
        and confetti, sharpening as progress climbs, then the reveal and the polaroid download
        send-off. Its states only exist mid-generation, so there's no inert demo — its two
        stand-alone pieces are right below.
      </p>
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
  </main>

  <dialog
    class="example-modal modal-dialog modal-fly-in modal-shell"
    use:modalDialog={() => ({
      open: exampleModalOpen,
      origin: exampleModalBtn ? buttonCenter(exampleModalBtn) : null,
      onRequestClose: () => (exampleModalOpen = false),
    })}
  >
    <div class="example-modal-content">
      <button
        type="button"
        class="modal-close-btn"
        aria-label="Close"
        onclick={() => (exampleModalOpen = false)}
      >
        <Icon name="close" class="modal-close-icon" />
      </button>
      <h2>Example modal</h2>
      <p>
        A native <code>&lt;dialog&gt;</code> opened with <code>showModal()</code> by the
        <code>modalDialog</code> action — centered by <code>.modal-shell</code>, dimmed backdrop,
        flown in from the button you tapped. Esc or a backdrop tap closes it.
      </p>
    </div>
  </dialog>
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

  /* Demo viewport: the transform makes the stage the containing block for the
     components' position: fixed chrome (a transformed ancestor contains fixed
     descendants everywhere, including WebKit — unlike `contain`, which Safari
     doesn't honor for fixed positioning), so corner buttons, banners, and
     panels anchor to the stage instead of the real viewport. */
  .stage {
    position: relative;
    transform: translate(0);
    overflow: hidden;
    margin-top: 16px;
    min-height: 140px;
    background:
      linear-gradient(rgba(252, 251, 248, 0.94), rgba(252, 251, 248, 0.94)),
      repeating-conic-gradient(#e9e4da 0% 25%, transparent 0% 50%) 0 0 / 24px 24px;
    border: 1px dashed #d8d0c2;
    border-radius: 12px;
  }

  /* Resizable demo viewport (palette + picker): drag the native resize handle.
     Sizes live on the specific stage classes below. */
  .resize-stage {
    margin-top: 16px;
    border: 1px dashed #d8d0c2;
    border-radius: 12px;
    overflow: hidden;
    resize: both;
    min-width: 200px;
    min-height: 140px;
    max-width: 100%;
  }

  .resize-hint {
    font-size: 12.5px !important;
    color: #999 !important;
    margin-top: 6px !important;
  }

  .palette-stage {
    width: min(100%, 620px);
    height: 380px;
    container: splotch-app / size;
    background: #f0ede7;
  }

  .palette-stage-inner {
    display: flex;
    width: 100%;
    height: 100%;
  }

  @container splotch-app (orientation: portrait) {
    .palette-stage-inner {
      flex-direction: column;
    }
  }

  .stage-paper {
    flex: 1;
    background: #fcfbf8;
  }

  .picker-stage {
    width: min(100%, 720px);
    height: 420px;
  }

  .picker-stage iframe {
    width: 100%;
    height: 100%;
    border: 0;
    display: block;
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

  .open-modal-button {
    margin-top: 14px;
    padding: 11px 18px;
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    background: var(--brand);
    border: none;
    border-radius: 10px;
    cursor: pointer;
  }

  @media (hover: hover) {
    .open-modal-button:hover {
      background: var(--brand-hover);
    }
  }

  .example-modal {
    max-width: 420px;
    width: 90%;
  }

  .example-modal-content {
    position: relative;
    padding: 28px 32px;
  }

  .example-modal-content h2 {
    margin: 0 0 12px;
    border: none;
    padding: 0;
    font-size: 22px;
  }

  .example-modal-content p {
    margin: 0;
    font-size: 14px;
    color: #666;
    line-height: 1.55;
  }

  /* Modal contents rendered in the page flow get the same white-card look the
     .modal-shell dialog would give them. */
  .modal-card {
    position: relative;
    margin: 16px auto 0;
    background: white;
    border-radius: 16px;
    box-shadow:
      0 0 0 1px #e8e2d8,
      0 8px 32px rgba(0, 0, 0, 0.12);
    overflow: hidden;
  }

  .modal-card-wide {
    max-width: 720px;
  }

  .modal-card-narrow {
    max-width: 500px;
  }

  .prompt-card {
    padding: 24px;
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
