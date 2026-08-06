<script lang="ts">
  import Disclosure from '$lib/components/design/Disclosure.svelte';
  import { scale, toCssVarName } from '$lib/design/tokens';
  import { scaleUsage } from '$lib/design/tokenUsage';

  const cssVar = (key: string) => `var(${toCssVarName(key)})`;

  type ScaleKey = keyof typeof scale;
  const scaleKeys = Object.keys(scale) as ScaleKey[];
  const fontSizeKeys = scaleKeys.filter((k): k is Extract<ScaleKey, `fontSize${string}`> =>
    k.startsWith('fontSize')
  );

  // Short roles beside each specimen; the full usage rules live in the
  // Disclosure below the rows. The mapped type makes the compiler demand a
  // short role for every token on the ramp.
  const typeShorts: Record<Extract<ScaleKey, `fontSize${string}`>, string> = {
    fontSizeXs: 'fine print',
    fontSizeSm: 'UI chrome',
    fontSizeMd: 'body prose',
    fontSizeLg: 'ledes & section heads',
    fontSizeXl: 'titles',
    fontSizeDisplay: 'page H1',
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
</script>

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
      <span class="type-sample" style:font-size={cssVar('inputFontSize')}>Splotch says hello</span>
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
        <span class="type-sample" style:font-weight={cssVar(specimen.token)}>{specimen.sample}</span
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
  .sub-note {
    font-size: var(--font-size-xs);
    color: var(--text-soft);
  }

  .value {
    line-height: 1.45;
  }

  .sub-note {
    max-width: 62ch;
    margin: 0 0 var(--space-1);
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
</style>
