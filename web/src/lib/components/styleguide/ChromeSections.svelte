<script lang="ts">
  import Icon from '$lib/components/Icon.svelte';
  import SliderRow from '$lib/components/settings/SliderRow.svelte';
  import ToggleRow from '$lib/components/settings/ToggleRow.svelte';

  let demoToggle = $state(true);
  let demoSlider = $state(60);

  const demoBrushes = [
    { icon: 'pen', label: 'Pen' },
    { icon: 'crayon', label: 'Crayon' },
    { icon: 'magic-brush', label: 'Magic brush' },
  ] as const;
  let demoBrush = $state<(typeof demoBrushes)[number]['icon']>('pen');

  // Bespoke, single-instance chrome: named here so it's discoverable, never
  // recreated (the live app is its documentation). Canonical names live in the
  // architecture skill's UI element glossary.
  const canvasChrome = [
    {
      name: 'Drawing Canvas',
      file: 'DrawingCanvas.svelte',
      blurb: 'The full-screen paper drawing surface.',
    },
    {
      name: 'Color Palette',
      file: 'ColorPalette.svelte',
      blurb:
        'Swatch bar — left edge in landscape, top in portrait; trims swatches by priority as space shrinks.',
    },
    {
      name: 'Gradient Swatch',
      file: 'ColorPicker.svelte',
      blurb: 'The last swatch, a honeycomb of palette hexagons that opens the hex color picker.',
    },
    {
      name: 'Actions Panel',
      file: 'ActionsPanel.svelte',
      blurb:
        'Bottom-corner drawer of chunky floating action buttons (brush, width, coloring, camera, AI, undo).',
    },
    {
      name: 'Brush Menu / Stroke Width Menu',
      file: 'BrushMenu.svelte · StrokeWidthMenu.svelte',
      blurb: 'The two flyouts — built on the shared flyout classes below.',
    },
    {
      name: 'Clear Button',
      file: 'ClearButton.svelte',
      blurb:
        'The red drag-to-clear trash control; its rest gradient is the unthemed --clear-gradient-rest, and ClearCoachmark.svelte paints the tutorial ghost from the same token.',
    },
    {
      name: 'Settings Button / Fullscreen Toggle',
      file: 'SettingsButton.svelte · FullscreenToggle.svelte',
      blurb: 'Corner-button instances (shared chrome below); positioning stays per-component.',
    },
    {
      name: 'Notch Band',
      file: 'NotchBand.svelte',
      blurb:
        'Thin strip filling the top safe-area inset so the camera notch sits on chrome, not paper.',
    },
    {
      name: 'Install Banner',
      file: 'InstallBanner.svelte',
      blurb: 'Bottom-center pill inviting "Add Splotch to your home screen".',
    },
    {
      name: 'Pointer Halos',
      file: 'PointerHalos.svelte',
      blurb: 'Touch-feedback rings under fingers while drawing.',
    },
    {
      name: 'AI Dial',
      file: 'AiDial.svelte',
      blurb: 'The generation-progress dial, with AiConfetti.svelte for the reveal.',
    },
    {
      name: 'Polaroid overlay',
      file: 'app.css (.polaroid-*)',
      blurb:
        'The save-screenshot flight — flash, frame, and glide are created imperatively on <body>.',
    },
  ];

  const pageChrome = [
    {
      name: 'PageShell + RuleLabel',
      file: 'page/PageShell.svelte',
      blurb:
        'The standalone-page chrome: ground, centered sheet, crayon-strip masthead, wordmark, hero. Worn by every standalone page (/android-beta, /feedback, /privacy, /admin, and this one).',
    },
    {
      name: 'Breadcrumb',
      file: 'Breadcrumb.svelte',
      blurb: 'The Home / current-page trail on the /dev harness routes.',
    },
    {
      name: 'Settings shells',
      file: 'SettingsModal.svelte · settings/CompactShell.svelte',
      blurb:
        'One section list, two responsive shells — drill-in on compact screens, sidebar when wide.',
    },
    {
      name: 'Error Screen',
      file: 'ErrorScreen.svelte',
      blurb: 'The crash boundary’s friendly restart surface.',
    },
  ];
</script>

<section>
  <h3>Settings furniture</h3>
  <p>
    The shared rows every Settings section is built from — pure props, themed end to end, icons from
    the app set. Live and interactive below.
  </p>
  <div class="furniture-demo">
    <ToggleRow
      icon="volume-on"
      label="Sound"
      id="styleguide-demo-toggle"
      checked={demoToggle}
      onToggle={(next) => (demoToggle = next)}
      help="Help text is one calm sentence."
    />
    <SliderRow
      id="styleguide-demo-slider"
      label="Button size"
      icon="photo-size-select-small"
      value={demoSlider}
      min={40}
      max={100}
      valueText={`${demoSlider}%`}
      onInput={(value) => (demoSlider = value)}
    />
  </div>
  <p>
    A control with a <strong>selected state</strong> is a picker, not a <code>Button</code> — the
    theme picker, the orientation segment, and the controls chips all render through the
    <code>SegmentedPicker</code> primitive above.
  </p>
</section>

<section>
  <h3>Shared chrome classes</h3>
  <p>
    Global classes in <code>app.css</code>, not components — dialogs and imperative DOM need them
    unscoped. Specimens below use the real classes; only placement is overridden, which stays with
    the consumer anyway.
  </p>

  <h4>Modal shell + close button · <code>.modal-shell</code> <code>.modal-close-btn</code></h4>
  <!-- The close disc is presentation here — a specimen has nothing to close,
       and a focusable control that does nothing is worse than none (the real
       behavior lives with each modal). Spans stay out of the tab order. -->
  <div class="modal-shell demo-modal-shell">
    <span class="modal-close-btn demo-inert" aria-hidden="true">
      <Icon name="close" class="modal-close-icon" />
    </span>
    <div class="demo-modal-body">
      <p class="demo-modal-title">Modal title</p>
      <p class="demo-modal-copy">
        The centered card — surface, radius, <code>--shadow-pop</code> — shared by all four modals.
        Monochrome icons inside re-ink automatically:
        <Icon name="settings" class="demo-inline-icon" />
        <Icon name="download" class="demo-inline-icon" />
      </p>
    </div>
  </div>

  <h4>Flyout menu + options · <code>.flyout-menu</code> <code>.flyout-option</code></h4>
  <div class="flyout-menu demo-flyout" role="group" aria-label="Flyout specimen">
    {#each demoBrushes as brush (brush.icon)}
      <button
        class="flyout-option"
        class:active={demoBrush === brush.icon}
        aria-label={brush.label}
        aria-pressed={demoBrush === brush.icon}
        onclick={() => (demoBrush = brush.icon)}
      >
        <Icon name={brush.icon} class="action-icon demo-flyout-icon" />
      </button>
    {/each}
  </div>
  <span class="value">
    Paper-card popover on --float-surface with --float-shadow-flyout — live: pick an option and the
    selected entry wears the brand ring.
  </span>

  <h4>Corner button · <code>.corner-button</code></h4>
  <!-- Presentation-only for the same reason as the close disc above. -->
  <div class="demo-corner-row">
    <span class="corner-button demo-inert" aria-hidden="true">
      <Icon name="settings" class="corner-button-icon" />
    </span>
    <span class="value">
      Muted canvas-corner chrome: whole-button opacity and icon tint step idle (0.4) → hover →
      pressed. Drawer toggle, Fullscreen Toggle, Settings Button.
    </span>
  </div>

  <h4>Polaroid frame · <code>.polaroid-frame</code></h4>
  <div class="polaroid-frame demo-polaroid">
    <div class="polaroid-image demo-polaroid-image"></div>
  </div>
  <span class="value">
    The save-screenshot effect. Photographic paper stays white in both themes on purpose — it reads
    as a physical polaroid, not a themed surface.
  </span>
</section>

<section>
  <h3>Named chrome</h3>
  <p>
    Bespoke, single-instance chrome — named so it's discoverable, not recreated (the running app is
    its documentation; the canonical glossary is in the <code>architecture</code> skill).
  </p>
  <h4>Canvas chrome</h4>
  <ul class="chrome-list">
    {#each canvasChrome as item (item.name)}
      <li>
        <span class="chrome-name">{item.name}</span>
        <code>{item.file}</code>
        <span class="value">{item.blurb}</span>
      </li>
    {/each}
  </ul>
  <h4>Page chrome</h4>
  <ul class="chrome-list">
    {#each pageChrome as item (item.name)}
      <li>
        <span class="chrome-name">{item.name}</span>
        <code>{item.file}</code>
        <span class="value">{item.blurb}</span>
      </li>
    {/each}
  </ul>
</section>

<style>
  section {
    margin-top: var(--space-8);
  }

  section > p {
    max-width: 60ch;
    margin: var(--space-2) 0 var(--space-3);
    font-size: var(--font-size-sm);
  }

  h3 {
    color: var(--text-strong);
    font-size: var(--font-size-lg);
    margin-bottom: var(--space-2);
  }

  h4 {
    color: var(--text-strong);
    font-size: var(--font-size-sm);
    margin: var(--space-5) 0 var(--space-2);
  }

  code {
    font-size: var(--font-size-xs);
    color: var(--brand-text);
  }

  /* --text-soft is pinned to hold 4.5:1 at these 12px sizes on the page
     ground (the axe scan in a11y.spec.ts enforces it). */
  .value {
    display: block;
    max-width: 60ch;
    margin-top: var(--space-2);
    font-size: var(--font-size-xs);
    color: var(--text-soft);
  }

  .furniture-demo {
    max-width: 420px;
    padding: var(--space-4);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  /* Placement overrides only — the modal is normally a centered fixed <dialog>,
     the flyout absolutely positioned against its trigger wrapper. Chrome stays
     with the real classes. */
  .demo-modal-shell {
    position: relative;
    top: auto;
    left: auto;
    transform: none;
    max-width: 420px;
  }

  .demo-flyout {
    position: static;
    display: inline-flex;
    flex-direction: row;
  }

  .demo-modal-body {
    padding: var(--space-5);
  }

  .demo-modal-title {
    color: var(--text-strong);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    margin-bottom: var(--space-2);
    padding-right: 44px;
  }

  .demo-modal-copy {
    max-width: 44ch;
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  .demo-modal-copy :global(.demo-inline-icon) {
    width: 18px;
    height: 18px;
    vertical-align: text-bottom;
  }

  .demo-flyout :global(.demo-flyout-icon) {
    width: 100%;
    height: 100%;
  }

  /* Inert specimens keep the shared chrome classes for their look but are
     spans, not buttons — give them the box the button element provided and
     drop the pointer affordance. */
  .demo-inert {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: default;
  }

  .demo-corner-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .demo-corner-row .value {
    margin-top: 0;
  }

  /* Static specimen: skip the save-time flight so the frame chrome is simply
     visible (the Motion section already demos the easings). */
  .demo-polaroid {
    display: inline-block;
    animation: none;
    opacity: 1;
  }

  .demo-polaroid-image {
    width: 180px;
    height: 130px;
  }

  .chrome-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-width: 72ch;
  }

  .chrome-list li {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .chrome-list .value {
    margin-top: 0;
  }

  .chrome-name {
    color: var(--text-strong);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
  }
</style>
