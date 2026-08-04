<script lang="ts">
  import Disclosure from '$lib/components/design/Disclosure.svelte';
  import { brand, scale, themes, toCssVarName, zIndex, type ThemeTokens } from '$lib/design/tokens';
  import { brandUsage, scaleUsage, themeUsage, zIndexUsage } from '$lib/design/tokenUsage';
  import type { ResolvedTheme } from '$lib/theme';

  interface Props {
    /** Which run of sections to render: the color families, or the scale sections. */
    group: 'color' | 'scales';
    /** The page's applied theme — picks which side of a chip's light·dark pair is current. */
    theme?: ResolvedTheme;
  }

  let { group, theme = 'light' }: Props = $props();

  const cssVar = (key: string) => `var(${toCssVarName(key)})`;

  // Family ramp columns: related colors sit next to each other as one bordered
  // stack instead of a flat wall of cards. Keys are typed against ThemeTokens
  // so a renamed token breaks the build, not the page.
  interface ColorChip {
    varName: string;
    /** What the chip paints — the live variable, so the theme toggle flips it. */
    fill: string;
    light: string;
    dark: string;
    usage: string;
    /** Explicit ink for fills the luminance heuristic can't read (channel triplets, gradients). */
    ink?: string;
  }

  const themeChip = (key: keyof ThemeTokens): ColorChip => ({
    varName: toCssVarName(key),
    fill: cssVar(key),
    light: themes.light[key],
    dark: themes.dark[key],
    usage: themeUsage[key],
  });

  const themeFamily = (label: string, keys: (keyof ThemeTokens)[]) => ({
    label,
    chips: keys.map(themeChip),
  });

  const colorFamilies = [
    {
      label: 'Brand & unthemed',
      chips: [
        {
          varName: '--brand',
          fill: 'var(--brand)',
          light: brand.brand,
          dark: brand.brand,
          usage: brandUsage.brand,
        },
        {
          varName: '--on-brand',
          fill: 'var(--on-brand)',
          light: brand.onBrand,
          dark: brand.onBrand,
          usage: brandUsage.onBrand,
        },
        // --brand-rgb is a channel triplet: a bare var() in `background` is
        // invalid CSS and computes as transparent (design.spec.ts asserts every
        // chip paints), so the fill recomposes it through rgb().
        {
          varName: '--brand-rgb',
          fill: 'rgb(var(--brand-rgb))',
          light: brand.brandRgb,
          dark: brand.brandRgb,
          usage: brandUsage.brandRgb,
          ink: '#fff',
        },
        {
          varName: '--clear-gradient-rest',
          fill: 'var(--clear-gradient-rest)',
          light: '#ff6b6b → #ee5a6f',
          dark: 'same — unthemed',
          usage: scaleUsage.clearGradientRest,
          ink: '#fff',
        },
      ] satisfies ColorChip[],
    },
    themeFamily('Ground & surfaces', ['appBg', 'surface', 'surface2', 'surfaceHover']),
    themeFamily('Text ink', ['textStrong', 'text', 'textSoft']),
    themeFamily('Icon ink', ['iconInk', 'iconMuted']),
    themeFamily('Hairlines', ['border', 'borderWarm', 'borderWarmStrong']),
    themeFamily('Control tracks', ['controlTrack', 'controlTrackHover', 'sliderNotch']),
    themeFamily('Brand ramp', [
      'brandWash',
      'brandWashHover',
      'brandText',
      'brandSolid',
      'brandSolidHover',
    ]),
    themeFamily('Feedback washes', ['successWash', 'successText', 'dangerWash', 'dangerText']),
    themeFamily('Paper', ['paper', 'paperMargin', 'holeStroke']),
    themeFamily('Floating on paper', [
      'floatSurface',
      'floatSurfaceHover',
      'floatBorder',
      'darkInkKeyline',
    ]),
  ];

  const nonColorKeys: (keyof ThemeTokens)[] = ['lineartFilter', 'lineartBlend', 'floatShadow'];

  // Ink for the var name and hex printed on a chip — a swatch-contrast pick
  // against the chip's own fill, not a theme token (the fill IS the specimen).
  // Transparent and low-alpha fills fall back to the themed text ink.
  const CHIP_INK_ON_LIGHT = '#333';
  const CHIP_INK_ON_DARK = '#fff';
  const CHIP_INK_LUMINANCE_SPLIT = 150;
  const CHIP_INK_MIN_ALPHA = 0.45;

  function inkOn(color: string): string | null {
    let r: number, g: number, b: number;
    let a = 1;
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
      r = Number.parseInt(full.slice(0, 2), 16);
      g = Number.parseInt(full.slice(2, 4), 16);
      b = Number.parseInt(full.slice(4, 6), 16);
    } else {
      const match = color.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1].split(',').map((s) => Number.parseFloat(s));
      [r, g, b] = parts;
      a = parts.length > 3 ? parts[3] : 1;
    }
    if (a < CHIP_INK_MIN_ALPHA) return null;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > CHIP_INK_LUMINANCE_SPLIT ? CHIP_INK_ON_LIGHT : CHIP_INK_ON_DARK;
  }

  // One usage detail open at a time — the advice stays out of the way until asked for.
  let expanded = $state<string | null>(null);

  type ScaleKey = keyof typeof scale;
  const scaleKeys = Object.keys(scale) as ScaleKey[];
  const keysStartingWith = <P extends string>(prefix: P) =>
    scaleKeys.filter((k): k is Extract<ScaleKey, `${P}${string}`> => k.startsWith(prefix));
  const spaceKeys = keysStartingWith('space');
  const radiusKeys = keysStartingWith('radius');
  const fontSizeKeys = keysStartingWith('fontSize');
  const shadowKeys = keysStartingWith('shadow');
  const durationKeys = keysStartingWith('duration');
  // Already authored low-to-high in tokens.ts; render it in that order so the
  // page shows the stacking order, not just the values.
  const zIndexKeys = Object.keys(zIndex) as (keyof typeof zIndex)[];

  // Short roles beside each specimen; the full usage rules live in the
  // Disclosure below the rows. The mapped types make the compiler demand a
  // short role for every token on the ramp.
  const typeShorts: Record<Extract<keyof typeof scale, `fontSize${string}`>, string> = {
    fontSizeXs: 'fine print',
    fontSizeSm: 'UI chrome',
    fontSizeMd: 'body prose',
    fontSizeLg: 'ledes & section heads',
    fontSizeXl: 'titles',
    fontSizeDisplay: 'page H1',
  };
  const radiusShorts: Record<Extract<keyof typeof scale, `radius${string}`>, string> = {
    radiusSm: 'inline chips',
    radiusMd: 'controls',
    radiusLg: 'cards & sheets',
    radiusPill: 'pills & toggle tracks',
  };
  const durationShorts: Record<Extract<keyof typeof scale, `duration${string}`>, string> = {
    durationFast: 'presses & hovers',
    durationBase: 'standard transitions',
    durationSlow: 'whole-surface entrances',
  };
  const weightShorts = {
    fontWeightBold: 'headings',
    fontWeightSemibold: 'buttons, active states, sub-heads',
    fontWeightMedium: 'quiet labels',
  } as const;

  // A fluid token's row shows its range, not the clamp expression — derived
  // from the source value so it can't drift.
  function shortValue(value: string): string {
    const clamp = value.match(/^clamp\((\d+)px,.*,\s*(\d+)px\)$/);
    return clamp ? `fluid ${clamp[1]}–${clamp[2]}px` : value;
  }

  const monoFamilyName = scale.fontMono.replaceAll("'", '').split(',')[0];

  const weightSpecimens = [
    { token: 'fontWeightBold', sample: 'Let them make a mess.' },
    { token: 'fontWeightSemibold', sample: 'Settings, not a paywall' },
    { token: 'fontWeightMedium', sample: 'Sound · Night Mode · Advanced Controls' },
  ] as const;

  const typeUsageKeys = [
    ...fontSizeKeys,
    'inputFontSize',
    'fontFamily',
    'fontMono',
    'fontWeightMedium',
    'fontWeightSemibold',
    'fontWeightBold',
  ] as const;

  const easeKeys = ['easePop', 'easeGlide'] as const;
</script>

{#if group === 'color'}
  <section id="color" data-sg-section>
    <h3>Color</h3>
    <p>
      Every color, grouped by family. Chips paint the live variable — flip the theme in the top bar
      and the values follow.
      <span class="hint">Tap any chip for its usage rule and both theme values.</span>
    </p>
    <div class="family-grid">
      {#each colorFamilies as family (family.label)}
        <div>
          <div class="family-label">{family.label}</div>
          <div class="family-stack">
            {#each family.chips as chip (chip.varName)}
              {@const value = theme === 'dark' ? chip.dark : chip.light}
              {@const open = expanded === chip.varName}
              <div>
                <button
                  type="button"
                  class="color-chip"
                  class:open
                  aria-expanded={open}
                  style:background={chip.fill}
                  style:color={chip.ink ?? inkOn(value) ?? 'var(--text)'}
                  onclick={() => (expanded = open ? null : chip.varName)}
                >
                  <span class="chip-name">{chip.varName}</span>
                  <span class="chip-value">{value}</span>
                </button>
                {#if open}
                  <div class="chip-detail">
                    {chip.usage}
                    <div class="chip-themes">light {chip.light} · dark {chip.dark}</div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
    <div class="non-color-card">
      <div class="family-label">Non-color theme tokens</div>
      <div class="non-color-rows">
        {#each nonColorKeys as key (key)}
          <div class="non-color-row">
            <code>{toCssVarName(key)}</code>
            <span class="value">{themes.light[key]} · {themes.dark[key]} — {themeUsage[key]}</span>
          </div>
        {/each}
      </div>
    </div>
  </section>
{:else}
  <section id="type" data-sg-section>
    <h3>Type scale</h3>
    <p>
      Five body steps plus the display tier, one role each — if two steps both look right, take the
      smaller. Titles stop at <code>xl</code>; only the H1 of a whole page takes
      <code>display</code>.
    </p>
    <div class="type-rows">
      {#each fontSizeKeys as key (key)}
        <div class="type-row">
          <span
            class="type-sample"
            style:font-size={cssVar(key)}
            style:font-weight={key === 'fontSizeDisplay' ? 'var(--font-weight-bold)' : undefined}
            >Splotch says hello</span
          >
          <span class="type-meta">
            <code>{toCssVarName(key)}</code>
            <span class="meta-line">{shortValue(scale[key])} · {typeShorts[key]}</span>
          </span>
        </div>
      {/each}
      <div class="type-row">
        <span class="type-sample" style:font-size={cssVar('inputFontSize')}>Splotch says hello</span
        >
        <span class="type-meta">
          <code>--input-font-size</code>
          <span class="meta-line">≥16px · text inputs (16px floor)</span>
        </span>
      </div>
      <div class="type-row">
        <span class="type-sample" style:font-family={cssVar('fontMono')}>Splotch says hello</span>
        <span class="type-meta">
          <code>--font-mono</code>
          <span class="meta-line">{monoFamilyName} · code &amp; versions</span>
        </span>
      </div>
    </div>
    <h4>Weights</h4>
    <p class="sub-note">
      Body prose stays at the untokenized 400 default; everything heavier goes through a token.
    </p>
    <div class="type-rows">
      {#each weightSpecimens as specimen (specimen.token)}
        <div class="type-row weight-row">
          <span class="type-sample" style:font-weight={cssVar(specimen.token)}
            >{specimen.sample}</span
          >
          <span class="type-meta">
            <code>{toCssVarName(specimen.token)}</code>
            <span class="meta-line">{scale[specimen.token]} · {weightShorts[specimen.token]}</span>
          </span>
        </div>
      {/each}
    </div>
    <Disclosure class="type-usage-disclosure">
      {#snippet summary()}Full usage rules &amp; the input-size floor{/snippet}
      <div class="type-usage-body">
        {#each typeUsageKeys as key (key)}
          <div class="type-usage-row">
            <code>{toCssVarName(key)}</code>
            <span class="value">{scaleUsage[key]}</span>
          </div>
        {/each}
      </div>
    </Disclosure>
  </section>

  <section id="space" data-sg-section>
    <h3>Spacing, radius &amp; hairlines</h3>
    <div class="space-rows">
      {#each spaceKeys as key (key)}
        <div class="space-row" title={scaleUsage[key]}>
          <code>{toCssVarName(key)}</code>
          <div class="space-bar" style:width={cssVar(key)}></div>
          <span class="space-value">{scale[key]}</span>
        </div>
      {/each}
    </div>
    <p class="sub-note">
      1–2 inside a control · 3–4 between controls and card padding · 5–6 tap targets and gutters ·
      7–8 section and page breaks.
    </p>
    <h4>Radius</h4>
    <div class="radius-tiles">
      {#each radiusKeys as key (key)}
        <div class="radius-tile" title={scaleUsage[key]}>
          <div
            class="radius-box"
            class:pill={key === 'radiusPill'}
            style:border-radius={cssVar(key)}
          ></div>
          <code>{toCssVarName(key)}</code>
          <span class="value">{scale[key]} · {radiusShorts[key]}</span>
        </div>
      {/each}
      <div class="radius-tile" title={scaleUsage.borderWidth}>
        <div class="border-box"></div>
        <code>--border-width</code>
        <span class="value">{scale.borderWidth} · the one hairline</span>
      </div>
    </div>
  </section>

  <section id="elevation" data-sg-section>
    <h3>Elevation</h3>
    <div class="shadow-grid">
      {#each shadowKeys as key (key)}
        <div class="shadow-tile">
          <div class="shadow-box" style:box-shadow={cssVar(key)}></div>
          <code>{toCssVarName(key)}</code>
          <span class="value">{scaleUsage[key]}</span>
        </div>
      {/each}
      <div class="shadow-tile">
        <div class="shadow-box float" style:box-shadow={cssVar('floatShadow')}></div>
        <code>--float-shadow</code>
        <span class="value">{themeUsage.floatShadow}</span>
      </div>
    </div>
  </section>

  <section id="motion" data-sg-section>
    <h3>Motion</h3>
    <p>
      Two curves: the springy overshoot for anything that pops in or celebrates, the glide for
      anything that settles or leaves. Press states scale down (0.9–0.96); hovers swap to a wash or
      hover token. Tuned one-shot choreography — the AI reveal, the polaroid flight — carries its
      own timing. The lanes run each easing curve on a loop.
    </p>
    <div class="motion-lanes">
      {#each easeKeys as key (key)}
        <div class="motion-lane-col">
          <div class="motion-lane">
            <span class="lane-dot" style:animation-timing-function={cssVar(key)}></span>
          </div>
          <code>{toCssVarName(key)}</code>
          <span class="value">{scaleUsage[key]}</span>
        </div>
      {/each}
    </div>
    <div class="duration-chips">
      {#each durationKeys as key (key)}
        <span class="duration-chip" title={scaleUsage[key]}>
          <code>{toCssVarName(key)}</code>
          <span class="value">{scale[key]} · {durationShorts[key]}</span>
        </span>
      {/each}
    </div>
  </section>

  <section id="stacking" data-sg-section>
    <h3>Stacking</h3>
    <p>
      The cross-component chrome order, low to high — one list, but not one stacking context, so a
      bigger number doesn't always win. Everything resolves in the root context except
      <code>--z-flyout</code>, which only orders the flyout inside <code>.actions-panel</code>; the
      <code>--z-clear-button</code>/<code>--z-notch</code> tie is real and resolved by DOM order.
    </p>
    <div class="z-table">
      {#each zIndexKeys as key, index (key)}
        <div class="z-row" class:top={index === zIndexKeys.length - 1}>
          <span class="z-value">{zIndex[key]}</span>
          <code class="z-name">{toCssVarName(key)}</code>
          <span class="z-usage">{zIndexUsage[key]}</span>
        </div>
      {/each}
    </div>
  </section>
{/if}

<style>
  section {
    margin-top: 48px;
    scroll-margin-top: 96px;
  }

  section > p {
    max-width: 62ch;
    margin: 0 0 18px;
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
    margin: 22px 0 10px;
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
  .value,
  .hint,
  .sub-note {
    font-size: var(--font-size-xs);
    color: var(--text-soft);
  }

  .value {
    line-height: 1.45;
  }

  .sub-note {
    max-width: 62ch;
    margin: 8px 0 0;
  }

  .family-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr));
    gap: 20px 24px;
    align-items: start;
  }

  .family-label {
    margin-bottom: var(--space-2);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-soft);
  }

  .family-stack {
    display: flex;
    flex-direction: column;
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .color-chip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    min-height: 44px;
    padding: 0 var(--space-3);
    border: none;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
  }

  .color-chip.open {
    box-shadow: inset 3px 0 0 var(--brand);
  }

  .chip-name {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip-value {
    flex-shrink: 0;
    font-size: var(--font-size-xs);
    font-family: var(--font-mono);
    opacity: 0.85;
  }

  .chip-detail {
    padding: 10px var(--space-3);
    background: var(--surface-2);
    border-top: var(--border-width) solid var(--border);
    font-size: var(--font-size-xs);
    line-height: 1.5;
    color: var(--text);
  }

  .chip-themes {
    margin-top: var(--space-1);
    color: var(--text-soft);
    font-family: var(--font-mono);
  }

  .non-color-card {
    margin-top: 20px;
    padding: var(--space-3) var(--space-4);
    background: var(--surface);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-md);
  }

  .non-color-card .family-label {
    margin-bottom: var(--space-2);
  }

  .non-color-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .non-color-row {
    font-size: var(--font-size-xs);
    line-height: 1.5;
  }

  .type-rows {
    display: flex;
    flex-direction: column;
  }

  .type-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 6px 24px;
    padding: 14px 0;
    border-bottom: var(--border-width) solid var(--border);
  }

  .weight-row {
    padding: var(--space-3) 0;
  }

  .type-sample {
    min-width: 0;
    color: var(--text-strong);
    line-height: 1.15;
    overflow-wrap: anywhere;
  }

  .type-meta {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    gap: 1px;
    text-align: right;
  }

  .meta-line {
    font-size: var(--font-size-xs);
    color: var(--text-soft);
  }

  section :global(.type-usage-disclosure) {
    margin-top: var(--space-4);
  }

  section :global(.type-usage-disclosure summary) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--brand-text);
    background: var(--surface-2);
  }

  .type-usage-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
  }

  .type-usage-row {
    font-size: var(--font-size-xs);
    line-height: 1.5;
  }

  .space-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: 560px;
  }

  .space-row {
    display: grid;
    grid-template-columns: 96px 1fr 44px;
    align-items: center;
    gap: var(--space-3);
  }

  .space-bar {
    height: 14px;
    background: var(--brand);
    opacity: 0.85;
    /* Demo bar, not a control: the radius ramp's smallest step would pill the
       narrowest bars, so this keeps a raw sliver of rounding. */
    border-radius: 2px;
  }

  .space-value {
    font-size: var(--font-size-xs);
    color: var(--text-soft);
    text-align: right;
  }

  .radius-tiles {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .radius-tile {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 130px;
  }

  .radius-box {
    height: 40px;
    background: var(--brand-wash);
    border: 2px solid var(--brand);
  }

  .radius-box.pill {
    height: 24px;
  }

  .border-box {
    height: 40px;
    background: var(--surface);
    border: var(--border-width) solid var(--brand);
    border-radius: var(--radius-md);
  }

  .shadow-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: var(--space-4);
  }

  .shadow-tile {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4);
    background: var(--surface-2);
    border-radius: var(--radius-md);
  }

  .shadow-box {
    height: 44px;
    border-radius: var(--radius-md);
    background: var(--surface);
  }

  .shadow-box.float {
    background: var(--float-surface);
    border: var(--border-width) solid var(--float-border);
  }

  .motion-lanes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-4);
    max-width: 560px;
    margin-bottom: 14px;
    /* Slow enough to read each curve's shape — demo pacing, not a motion token. */
    --lane-demo-duration: 1.2s;
  }

  .motion-lane-col {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .motion-lane {
    position: relative;
    height: 40px;
    background: var(--surface-2);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .lane-dot {
    position: absolute;
    top: 50%;
    left: var(--space-2);
    width: var(--space-6);
    height: var(--space-6);
    margin-top: calc(-1 * var(--space-6) / 2);
    border-radius: 50%;
    background: var(--brand);
    animation: lane-travel var(--lane-demo-duration) infinite alternate;
  }

  @keyframes lane-travel {
    to {
      transform: translateX(140px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .lane-dot {
      animation: none;
    }
  }

  .duration-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .duration-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: var(--surface-2);
    border-radius: var(--radius-pill);
  }

  .z-table {
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .z-row {
    display: grid;
    grid-template-columns: 56px 172px 1fr;
    gap: var(--space-3);
    align-items: baseline;
    padding: var(--space-2) 14px;
    border-bottom: var(--border-width) solid var(--border);
  }

  .z-row:last-child {
    border-bottom: none;
  }

  /* The top of the chrome order gets its own surface so the ranking has a
     visible summit. */
  .z-row.top {
    background: var(--surface);
  }

  .z-value {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    font-family: var(--font-mono);
    color: var(--brand-text);
    text-align: right;
  }

  .z-name {
    color: var(--text-strong);
  }

  .z-usage {
    font-size: var(--font-size-xs);
    color: var(--text-soft);
    line-height: 1.45;
  }

  @media (max-width: 640px) {
    .z-row {
      grid-template-columns: 44px 1fr;
      gap: 2px var(--space-3);
      padding: var(--space-2) var(--space-3);
    }

    .z-usage {
      grid-column: 2;
    }
  }
</style>
