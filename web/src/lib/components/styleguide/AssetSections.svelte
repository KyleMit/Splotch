<script lang="ts">
  import Icon, { COLOR_ICONS, ICON_NAMES } from '$lib/components/Icon.svelte';
  import { themes } from '$lib/design/tokens';
  import { PALETTE_COLORS } from '$lib/palette';

  const monoIcons = ICON_NAMES.filter((name) => !COLOR_ICONS.has(name));
  const spotIcons = ICON_NAMES.filter((name) => COLOR_ICONS.has(name));

  // Both papers side by side regardless of the active theme: the values come
  // from the themes object itself rather than the live CSS variables, which
  // only ever resolve to one theme at a time.
  const paperSpecimens = [
    { label: 'light paper', value: themes.light.paper, grain: true },
    { label: 'dark paper', value: themes.dark.paper, grain: true },
    { label: 'light margin', value: themes.light.paperMargin, grain: false },
    { label: 'dark margin', value: themes.dark.paperMargin, grain: false },
  ];
</script>

<section>
  <h3>Paper</h3>
  <p>
    The canvas is warm off-white paper under a low-alpha handmade-paper grain (<code
      >icons/handmade-paper.webp</code
    >, tiled). Dark paper keeps the same grain webp — only the color beneath changes.
    <code>--paper-margin</code> is the flat tone behind the rotation-locked sheet.
  </p>
  <div class="paper-grid">
    {#each paperSpecimens as specimen (specimen.label)}
      <div class="paper-card">
        <div
          class="paper-chip"
          style:background={specimen.grain
            ? `${specimen.value} url('/icons/handmade-paper.webp') repeat`
            : specimen.value}
        ></div>
        <span class="value">{specimen.label} · {specimen.value}</span>
      </div>
    {/each}
  </div>
</section>

<section>
  <h3>Crayon palette</h3>
  <p>
    The drawing inks from <code>lib/palette.ts</code>, in the palette's own order — purple first
    because it's the default selection; "bonus" swatches only appear when the layout has the most
    room. Black is near-black ink that presents (and paints) as white on dark paper.
  </p>
  <div class="crayon-row">
    {#each PALETTE_COLORS as color, index (color.label)}
      <div class="crayon">
        <span class="crayon-dot" class:selected={index === 0} style:background={color.hex}></span>
        <span class="value">{color.label}{color.bonus ? ' · bonus' : ''}</span>
      </div>
    {/each}
  </div>
</section>

<section>
  <h3>Icons</h3>
  <p>
    A first-party SVG set rendered inline through <code>&lt;Icon&gt;</code> — no icon font, no CDN
    set, no emoji-as-icons. Monochrome glyphs bake a near-black fill and get re-inked via
    <code>fill: var(--icon-ink)</code> on themed surfaces. Full-color "spot" icons carry their own
    palette and are never tinted — the split below is <code>COLOR_ICONS</code> in
    <code>Icon.svelte</code>.
  </p>
  <h4>Monochrome · re-inked ({monoIcons.length})</h4>
  <div class="icon-grid mono">
    {#each monoIcons as name (name)}
      <div class="icon-cell">
        <Icon {name} class="icon-demo" />
        <span class="value">{name}</span>
      </div>
    {/each}
  </div>
  <h4>Spot color · never tinted ({spotIcons.length})</h4>
  <div class="icon-grid spot">
    {#each spotIcons as name (name)}
      <div class="icon-cell">
        <Icon {name} class="icon-demo" />
        <span class="value">{name}</span>
      </div>
    {/each}
  </div>
</section>

<style>
  section {
    margin-top: var(--space-8);
  }

  section > p {
    max-width: 60ch;
    margin: var(--space-2) 0 var(--space-3);
    font-size: var(--font-size-md);
  }

  h3 {
    color: var(--text-strong);
    font-size: var(--font-size-xl);
    margin-bottom: var(--space-2);
  }

  h4 {
    color: var(--text-strong);
    font-size: var(--font-size-md);
    margin: var(--space-4) 0 var(--space-2);
  }

  code {
    font-size: var(--font-size-xs);
    color: var(--brand-text);
  }

  /* --text-mid, not --text-muted: these 12px labels must hold 4.5:1 on the
     page ground (the axe scan in a11y.spec.ts enforces it). */
  .value {
    font-size: var(--font-size-xs);
    color: var(--text-mid);
  }

  .paper-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--space-3);
  }

  .paper-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .paper-chip {
    height: var(--space-8);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
  }

  .crayon-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  .crayon {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }

  .crayon-dot {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    box-shadow: var(--shadow-sm);
  }

  .crayon-dot.selected {
    box-shadow:
      0 0 0 3px var(--surface),
      0 0 0 6px var(--brand),
      var(--shadow-sm);
  }

  .icon-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
    gap: var(--space-3);
  }

  .icon-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    text-align: center;
    overflow-wrap: anywhere;
  }

  .icon-grid :global(.icon-demo) {
    width: 26px;
    height: 26px;
  }

  .icon-grid.spot :global(.icon-demo) {
    width: 42px;
    height: 42px;
  }

  /* The same re-ink the themed surfaces apply (see .modal-shell in app.css);
     spot icons opt out via the icon-color class Icon.svelte sets. */
  .icon-grid :global([data-icon]:not(.icon-color) svg) {
    fill: var(--icon-ink);
  }
</style>
