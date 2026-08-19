<script lang="ts">
  import Icon from '$lib/components/Icon.svelte';
  import SliderRow from '$lib/components/settings/SliderRow.svelte';
  import ToggleRow from '$lib/components/settings/ToggleRow.svelte';
  import {
    AI_AUTO_SAVE_HELP,
    AI_AUTO_SAVE_LABEL,
    AI_CREATE_HELP,
    AI_CREATE_LABEL,
    AI_CUSTOMIZATION_HELP,
    AI_CUSTOMIZATION_LABEL,
  } from '$lib/components/settings/aiSettingsCopy';
  import { paletteHex } from '$lib/palette';
  import ChromeMiniMap, { type MiniMapZone } from './ChromeMiniMap.svelte';

  let demoAiEnabled = $state(false);
  let demoAiCustomization = $state(true);
  let demoAutoSaveAi = $state(false);
  let demoSlider = $state(60);

  const demoBrushes = [
    { icon: 'brush-pen', label: 'Pen' },
    { icon: 'brush-crayon', label: 'Crayon' },
    { icon: 'brush-magic', label: 'Magic brush' },
  ] as const;
  let demoBrush = $state<(typeof demoBrushes)[number]['icon']>('brush-pen');

  interface ChromeEntry {
    name: string;
    file: string;
    blurb: string;
    zone: MiniMapZone;
  }

  // Bespoke, single-instance chrome: named here so it's discoverable, never
  // recreated (the live app is its documentation). Canonical names live in the
  // architecture skill's UI element glossary.
  const canvasChrome: ChromeEntry[] = [
    {
      name: 'Drawing Canvas',
      file: 'DrawingCanvas.svelte',
      blurb: 'The full-screen paper drawing surface.',
      zone: 'canvas',
    },
    {
      name: 'Color Palette',
      file: 'ColorPalette.svelte',
      blurb:
        'Swatch bar — left edge in landscape, top in portrait; trims swatches by priority as space shrinks.',
      zone: 'palette',
    },
    {
      name: 'Gradient Swatch',
      file: 'ColorPicker.svelte',
      blurb: 'The last swatch, a honeycomb of palette hexagons that opens the hex color picker.',
      zone: 'gradient',
    },
    {
      name: 'Actions Panel',
      file: 'ActionsPanel.svelte',
      blurb:
        'Bottom-corner drawer of chunky floating action buttons (brush, width, coloring, camera, AI, undo).',
      zone: 'actions',
    },
    {
      name: 'Brush Menu / Stroke Width Menu',
      file: 'BrushMenu.svelte · StrokeWidthMenu.svelte',
      blurb: 'The two flyouts — built on the shared flyout classes above.',
      zone: 'flyout',
    },
    {
      name: 'Clear Button',
      file: 'ClearButton.svelte',
      blurb:
        'The red drag-to-clear trash control; its rest gradient is the unthemed --clear-gradient-rest, and ClearCoachmark.svelte paints the tutorial ghost from the same token.',
      zone: 'clear',
    },
    {
      name: 'Settings Button / Fullscreen Toggle',
      file: 'SettingsButton.svelte · FullscreenToggle.svelte',
      blurb: 'Corner-button instances (shared chrome above); positioning stays per-component.',
      zone: 'corners',
    },
    {
      name: 'Notch Band',
      file: 'NotchBand.svelte',
      blurb:
        'Thin strip filling the top safe-area inset so the camera notch sits on chrome, not paper.',
      zone: 'notch',
    },
    {
      name: 'Install Banner',
      file: 'InstallBanner.svelte',
      blurb: 'Bottom-center pill inviting "Add Splotch to your home screen".',
      zone: 'banner',
    },
    {
      name: 'Pointer Halos',
      file: 'PointerHalos.svelte',
      blurb: 'Touch-feedback rings under fingers while drawing.',
      zone: 'halos',
    },
    {
      name: 'AI Dial',
      file: 'AiDial.svelte',
      blurb: 'The generation-progress dial, with AiConfetti.svelte for the reveal.',
      zone: 'dial',
    },
    {
      name: 'Waiting Polaroid',
      file: 'AiWaitingPolaroid.svelte',
      blurb:
        "The picture being made, pinned to the canvas's top-left corner past the palette while the child keeps drawing — and the only way back into it (ADR-0117).",
      zone: 'waitingPolaroid',
    },
    {
      name: 'Polaroid overlay',
      file: 'app.css (.polaroid-*)',
      blurb:
        'The save-screenshot flight — flash, frame, and glide are created imperatively on <body>.',
      zone: 'polaroid',
    },
  ];

  const pageChrome: ChromeEntry[] = [
    {
      name: 'PageShell + RuleLabel',
      file: 'page/PageShell.svelte',
      blurb:
        'The standalone-page chrome: ground, centered sheet, crayon-strip masthead, wordmark, hero. Worn by every standalone page (/beta, /changelog, /feedback, /privacy, /admin).',
      zone: 'shell',
    },
    {
      name: 'Settings shells',
      file: 'SettingsModal.svelte · settings/CompactShell.svelte',
      blurb:
        'One section list, two responsive shells — drill-in on compact screens, sidebar when wide.',
      zone: 'settings',
    },
    {
      name: 'Sidebar TOC',
      file: 'nav/SidebarToc.svelte',
      blurb:
        'The guide-rail table of contents the wide Settings sidebar, /design and /changelog all wear — one hairline track down the list, with the reading position thickening and tinting its own segment. Each host keeps its own scrollspy; the component takes the answer and renders it.',
      zone: 'settings',
    },
    {
      name: 'Error Screen',
      file: 'ErrorScreen.svelte',
      blurb: 'The crash boundary’s friendly restart surface.',
      zone: 'error',
    },
  ];
</script>

<section id="furniture" data-sg-section>
  <h3>Settings furniture</h3>
  <p>
    The shared rows every Settings section is built from — pure props, themed end to end, icons from
    the app set. Live and interactive below.
  </p>
  <div class="furniture-demo">
    <ToggleRow
      icon="wand-stars"
      label={AI_CREATE_LABEL}
      id="styleguide-demo-ai-toggle"
      checked={demoAiEnabled}
      onToggle={(next) => (demoAiEnabled = next)}
      help={demoAiEnabled ? AI_CREATE_HELP.on : AI_CREATE_HELP.off}
    />
    <ToggleRow
      icon="customize"
      label={AI_CUSTOMIZATION_LABEL}
      id="styleguide-demo-ai-customization-toggle"
      checked={demoAiCustomization}
      onToggle={(next) => (demoAiCustomization = next)}
      help={AI_CUSTOMIZATION_HELP}
    />
    <ToggleRow
      icon="download"
      label={AI_AUTO_SAVE_LABEL}
      id="styleguide-demo-auto-save-ai-toggle"
      checked={demoAutoSaveAi}
      onToggle={(next) => (demoAutoSaveAi = next)}
      help={AI_AUTO_SAVE_HELP}
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

<section id="chrome" data-sg-section>
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
    Paper-card popover on --float-surface with --float-shadow — live: pick an option and the
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
  <div class="polaroid-row">
    <!-- Static specimen on the real classes: skip the save-time flight and
         settle at the flight's final tilt so the frame chrome is simply
         visible (the Motion section already demos the easings). -->
    <div class="polaroid-frame demo-polaroid">
      <div class="polaroid-image demo-polaroid-image">
        <!-- A mock crayon scribble so it's clear pictures go IN the frame;
             strokes take the real drawing inks from lib/palette.ts. -->
        <svg viewBox="0 0 200 150" width="200" height="150" aria-hidden="true">
          <path
            d="M28 112 C 30 84, 44 62, 62 58 C 84 53, 92 74, 76 84 C 60 94, 48 78, 60 66 C 74 52, 98 54, 104 72"
            fill="none"
            stroke={paletteHex('Purple')}
            stroke-width="7"
            stroke-linecap="round"
          />
          <circle
            cx="152"
            cy="44"
            r="16"
            fill="none"
            stroke={paletteHex('Yellow')}
            stroke-width="7"
          />
          <path
            d="M152 20 L152 8 M172 28 L181 19 M176 48 L189 50 M132 28 L123 19 M128 48 L115 50"
            stroke={paletteHex('Yellow')}
            stroke-width="6"
            stroke-linecap="round"
            fill="none"
          />
          <path
            d="M22 132 C 52 122, 88 138, 118 128 C 148 118, 168 134, 184 126"
            fill="none"
            stroke={paletteHex('Green')}
            stroke-width="7"
            stroke-linecap="round"
          />
        </svg>
      </div>
    </div>
    <span class="value polaroid-caption">
      The save-screenshot effect: the drawing rides inside the frame, flies in on
      <code>--ease-glide</code>, and settles at −4°. Photographic paper stays white in both themes
      on purpose — it reads as a physical polaroid, not a themed surface.
    </span>
  </div>
</section>

<section id="named" data-sg-section>
  <h3>Named chrome</h3>
  <p>
    Bespoke, single-instance chrome — named so it's discoverable, not recreated (the running app is
    its documentation; the canonical glossary is in the <code>architecture</code> skill). Each map shows
    where it lives on the canvas.
  </p>
  <h4>Canvas chrome</h4>
  <div class="chrome-grid">
    {#each canvasChrome as item (item.name)}
      <div class="chrome-card">
        <ChromeMiniMap zone={item.zone} ground="paper" />
        <div class="chrome-info">
          <span class="chrome-name">{item.name}</span>
          <code>{item.file}</code>
          <span class="value">{item.blurb}</span>
        </div>
      </div>
    {/each}
  </div>
  <h4>Page chrome</h4>
  <div class="chrome-grid">
    {#each pageChrome as item (item.name)}
      <div class="chrome-card">
        <ChromeMiniMap zone={item.zone} ground="page" />
        <div class="chrome-info">
          <span class="chrome-name">{item.name}</span>
          <code>{item.file}</code>
          <span class="value">{item.blurb}</span>
        </div>
      </div>
    {/each}
  </div>
</section>

<style>
  section {
    margin-top: 48px;
  }

  section > p {
    max-width: 62ch;
    margin: 0 0 14px;
    font-size: var(--font-size-sm);
    color: var(--text);
  }

  h3 {
    margin: 0 0 6px;
    color: var(--text-strong);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
  }

  h4 {
    margin: 20px 0 var(--space-2);
    color: var(--text-strong);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
  }

  code {
    font-size: var(--font-size-xs);
    color: var(--brand-text);
    overflow-wrap: anywhere;
  }

  /* --text-soft is pinned to hold 4.5:1 at these 12px sizes on the page
     ground (the axe scan in a11y.spec.ts enforces it). */
  .value {
    display: block;
    max-width: 62ch;
    margin-top: var(--space-2);
    font-size: var(--font-size-xs);
    color: var(--text-soft);
    line-height: 1.45;
  }

  .furniture-demo {
    max-width: 420px;
    padding: var(--space-4);
    background: var(--surface);
    border: var(--border-width) solid var(--border);
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

  .demo-corner-row .value,
  .polaroid-caption {
    margin-top: 0;
  }

  .polaroid-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-6);
  }

  .demo-polaroid {
    display: inline-block;
    animation: none;
    opacity: 1;
    transform: rotate(-4deg);
    margin: 10px 6px var(--space-1);
  }

  .demo-polaroid-image {
    width: 200px;
    height: 150px;
    background-image: url('/icons/handmade-paper.webp');
    background-repeat: repeat;
  }

  .demo-polaroid-image svg {
    display: block;
  }

  .polaroid-caption {
    max-width: 38ch;
  }

  .chrome-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 330px), 1fr));
    gap: 14px;
  }

  .chrome-card {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    padding: var(--space-3);
    background: var(--surface);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-md);
  }

  .chrome-info {
    min-width: 0;
  }

  .chrome-info code {
    display: block;
  }

  .chrome-info .value {
    margin-top: 2px;
  }

  .chrome-name {
    display: block;
    color: var(--text-strong);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
  }
</style>
