<script lang="ts">
  import {
    brand,
    isColorToken,
    scale,
    themes,
    toCssVarName,
    type ThemeTokens,
  } from '$lib/design/tokens';
  import { brandUsage, scaleUsage, themeUsage } from '$lib/design/tokenUsage';
  import type { ResolvedTheme } from '$lib/theme';
  import { pickChipInk } from './chipInk';

  interface Props {
    /** The page's applied theme — picks which side of a chip's light·dark pair is current. */
    theme: ResolvedTheme;
  }

  let { theme }: Props = $props();

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
    /** Precomputed ink for fills whose basis isn't the displayed value (triplets, gradients). */
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

  const gradientStops = scale.clearGradientRest.match(/#[0-9a-fA-F]{3,8}/g) ?? [];

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
          ink: pickChipInk([brand.brand], themes.light.appBg),
        },
        {
          varName: '--on-brand',
          fill: 'var(--on-brand)',
          light: brand.onBrand,
          dark: brand.onBrand,
          usage: brandUsage.onBrand,
          ink: pickChipInk([brand.onBrand], themes.light.appBg),
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
          ink: pickChipInk([`rgb(${brand.brandRgb})`], themes.light.appBg),
        },
        {
          varName: '--clear-gradient-rest',
          fill: 'var(--clear-gradient-rest)',
          light: gradientStops.join(' → '),
          dark: 'same — unthemed',
          usage: scaleUsage.clearGradientRest,
          ink: pickChipInk(gradientStops, themes.light.appBg),
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

  const nonColorKeys = (Object.keys(isColorToken) as (keyof ThemeTokens)[]).filter(
    (key) => !isColorToken[key]
  );

  // One usage detail open at a time — the advice stays out of the way until asked for.
  let expanded = $state<string | null>(null);
</script>

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
                style:color={chip.ink ?? pickChipInk([value], themes[theme].appBg)}
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

  code {
    font-size: var(--font-size-xs);
    color: var(--brand-text);
    overflow-wrap: anywhere;
  }

  /* --text-soft is pinned to hold 4.5:1 at these 12px sizes on the page
     ground (the axe scan in a11y.spec.ts enforces it). */
  .value,
  .hint {
    font-size: var(--font-size-xs);
    color: var(--text-soft);
  }

  .value {
    line-height: 1.45;
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

  .non-color-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .non-color-row {
    font-size: var(--font-size-xs);
    line-height: 1.5;
  }
</style>
