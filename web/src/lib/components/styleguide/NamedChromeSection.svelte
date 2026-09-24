<script lang="ts">
  import ChromeMiniMap, { type MiniMapZone } from './ChromeMiniMap.svelte';

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
      file: 'ColorSwatch.svelte · ColorPicker.svelte',
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
      name: 'Save Failure Banner',
      file: 'SaveFailureBanner.svelte',
      blurb: 'Top-of-canvas notice telling the grown-up a picture was not saved, with Try again.',
      zone: 'topBanner',
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
