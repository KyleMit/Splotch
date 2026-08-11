<script lang="ts">
  import Icon, { COLOR_ICONS, ICON_NAMES } from '$lib/components/Icon.svelte';
  import type { CommonIconName } from '$lib/components/iconTypes';
  import { themes } from '$lib/design/tokens';
  import { PALETTE_COLORS } from '$lib/palette';

  interface Props {
    /** Which run of sections to render: the palette + paper materials, or the icon set. */
    group: 'materials' | 'icons';
  }

  let { group }: Props = $props();

  const monoIcons = ICON_NAMES.filter((name) => !COLOR_ICONS.has(name));
  const spotIcons = ICON_NAMES.filter((name) => COLOR_ICONS.has(name));

  // Variant families render as joined strips so a family never wraps apart
  // mid-grid. A `*`-prefixed label means the shared part is the suffix, so the
  // member label under each icon is its leading word instead.
  interface IconFamily {
    label: string;
    members: CommonIconName[];
  }

  const monoFamilies: IconFamily[] = [
    {
      label: 'chevron-*',
      members: ['chevron-up', 'chevron-down', 'chevron-left', 'chevron-right'],
    },
    { label: 'theme-*', members: ['theme-light', 'theme-dark', 'theme-auto'] },
    {
      label: 'mobile-*',
      members: ['mobile-portrait', 'mobile-landscape', 'mobile-rotate', 'mobile-lock'],
    },
    { label: 'volume-*', members: ['volume-on', 'volume-off'] },
    { label: 'fullscreen-*', members: ['fullscreen', 'fullscreen-exit'] },
    { label: '*-homescreen', members: ['add-homescreen', 'install-homescreen'] },
  ];

  const spotFamilies: (IconFamily & { note: string })[] = [
    {
      label: 'brush-*',
      note: 'the Brush Menu entries, in menu order',
      members: ['brush-pen', 'brush-crayon', 'brush-magic', 'brush-eraser'],
    },
    {
      label: 'size-brush-1…5',
      note: 'the brush stroke previews, inked by currentColor',
      members: ['size-brush-1', 'size-brush-2', 'size-brush-3', 'size-brush-4', 'size-brush-5'],
    },
    {
      label: 'size-magic-1…5',
      note: 'the magic stroke previews, carrying the brush’s rainbow',
      members: ['size-magic-1', 'size-magic-2', 'size-magic-3', 'size-magic-4', 'size-magic-5'],
    },
    {
      label: 'size-eraser-1…5',
      note: 'the eraser hole previews (--paper / --hole-stroke)',
      members: [
        'size-eraser-1',
        'size-eraser-2',
        'size-eraser-3',
        'size-eraser-4',
        'size-eraser-5',
      ],
    },
    {
      label: 'line-weight-*',
      note: 'the Stroke Width Button, per active tool',
      members: ['line-weight-brush', 'line-weight-eraser', 'line-weight-magic'],
    },
    {
      label: 'trash-*',
      note: 'the Clear Button pair',
      members: ['trash-closed', 'trash-open'],
    },
  ];

  function familySuffix(name: CommonIconName, familyLabel: string): string {
    const parts = name.split('-');
    return familyLabel.startsWith('*') ? parts[0] : parts[parts.length - 1];
  }

  const familyMembers = new Set(
    [...monoFamilies, ...spotFamilies].flatMap((family) => family.members)
  );
  const monoSingles = monoIcons.filter((name) => !familyMembers.has(name));
  const spotSingles = spotIcons.filter((name) => !familyMembers.has(name));

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

{#if group === 'materials'}
  <section id="palette" data-sg-section>
    <h3>Crayon palette</h3>
    <p>
      The drawing inks from <code>lib/palette.ts</code>, in the palette's own order — purple first
      because it's the default selection. The bar shows as many of them as the viewport fits and
      drops the rest by trim priority, so a small phone still gets a rainbow rather than a handful.
      Black is near-black ink that presents (and paints) as white on dark paper.
    </p>
    <div class="palette-card">
      {#each PALETTE_COLORS as color, index (color.label)}
        <div class="crayon">
          <span class="crayon-dot" class:selected={index === 0} style:background={color.hex}></span>
          <span class="value">{color.label}</span>
        </div>
      {/each}
    </div>
  </section>

  <section id="paper" data-sg-section>
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
{:else}
  <section id="icons" data-sg-section>
    <h3>Icons</h3>
    <p>
      A first-party SVG set rendered inline through <code>&lt;Icon&gt;</code> — no icon font, no CDN
      set, no emoji-as-icons. Monochrome glyphs bake a near-black fill and get re-inked via
      <code>fill: var(--icon-ink)</code> on themed surfaces. Full-color "spot" icons carry their own
      palette and are never tinted wholesale — the split below is <code>COLOR_ICONS</code> in
      <code>Icon.svelte</code>. Individual paths inside a spot icon can still take a per-theme fill:
      they paint with <code>var(--icon-&lt;icon&gt;-&lt;part&gt;)</code>, declared in
      <code>iconTokens.ts</code> and emitted into <code>tokens.css</code> beside the semantic tokens.
      Flip the theme toggle above to see which parts move.
    </p>

    <h4>Monochrome · re-inked ({monoIcons.length})</h4>
    <div class="family-cards">
      {#each monoFamilies as family (family.label)}
        <div class="family-card">
          <div class="family-strip">
            {#each family.members as name (name)}
              <div class="family-member">
                <Icon {name} class="icon-demo" />
                <span class="suffix">{familySuffix(name, family.label)}</span>
              </div>
            {/each}
          </div>
          <code class="family-name">{family.label}</code>
        </div>
      {/each}
    </div>
    <div class="icon-grid mono">
      {#each monoSingles as name (name)}
        <div class="icon-cell">
          <Icon {name} class="icon-demo" />
          <span class="value">{name}</span>
        </div>
      {/each}
    </div>

    <h4>Spot color · never tinted ({spotIcons.length})</h4>
    <div class="family-cards spot">
      {#each spotFamilies as family (family.label)}
        <div class="family-card">
          <div class="family-strip">
            {#each family.members as name (name)}
              <div class="family-member spot-member">
                <Icon {name} class="icon-demo-spot" />
                <span class="suffix">{familySuffix(name, family.label)}</span>
              </div>
            {/each}
          </div>
          <span class="family-note"><code>{family.label}</code> · {family.note}</span>
        </div>
      {/each}
    </div>
    <div class="icon-grid spot">
      {#each spotSingles as name (name)}
        <div class="icon-cell">
          <Icon {name} class="icon-demo-spot" />
          <span class="value">{name}</span>
        </div>
      {/each}
    </div>
  </section>
{/if}

<style>
  section {
    margin-top: 48px;
  }

  section > p {
    max-width: 62ch;
    margin: 0 0 16px;
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
    margin: 18px 0 10px;
    color: var(--text-strong);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
  }

  code {
    font-size: var(--font-size-xs);
    color: var(--brand-text);
  }

  /* --text-soft is pinned to hold 4.5:1 at these 12px sizes on the page
     ground (the axe scan in a11y.spec.ts enforces it). */
  .value,
  .suffix {
    font-size: var(--font-size-xs);
    color: var(--text-soft);
  }

  .palette-card {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4) var(--space-5);
    padding: 18px;
    background: var(--surface);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-lg);
  }

  .crayon {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    width: 64px;
  }

  .crayon .value {
    text-align: center;
    line-height: 1.3;
  }

  .crayon-dot {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    box-shadow: var(--shadow-control);
  }

  .crayon-dot.selected {
    box-shadow:
      0 0 0 3px var(--surface),
      0 0 0 6px var(--brand),
      var(--shadow-control);
  }

  .paper-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--space-3);
  }

  .paper-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .paper-chip {
    height: 72px;
    border-radius: var(--radius-sm);
    border: var(--border-width) solid var(--border);
  }

  .family-cards {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 14px;
  }

  .family-cards.spot {
    flex-direction: column;
    align-items: flex-start;
  }

  .family-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: 100%;
    padding: 10px var(--space-3);
    background: var(--surface-2);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-md);
  }

  .family-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }

  /* min-width, not width: a long member label (landscape) widens its own
     column instead of colliding with its neighbor. */
  .family-member {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    min-width: 48px;
    padding: 0 2px;
  }

  .spot-member {
    min-width: 56px;
  }

  .family-name {
    text-align: center;
  }

  .family-note {
    font-size: var(--font-size-xs);
    color: var(--text-soft);
  }

  .icon-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(86px, 1fr));
    gap: var(--space-3) var(--space-2);
  }

  .icon-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    text-align: center;
    overflow-wrap: anywhere;
  }

  section :global(.icon-demo) {
    width: 24px;
    height: 24px;
  }

  section :global(.icon-demo-spot) {
    width: 40px;
    height: 40px;
  }

  /* The size previews ink themselves via currentColor, so the spot strips and
     grid carry a readable ink for them to pick up. */
  .family-cards.spot,
  .icon-grid.spot {
    color: var(--text-strong);
  }

  /* The same re-ink the themed surfaces apply (see .modal-shell in app.css);
     spot icons opt out via the icon-color class Icon.svelte sets. */
  section :global([data-icon]:not(.icon-color) svg) {
    fill: var(--icon-ink);
  }
</style>
