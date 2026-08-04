<script lang="ts">
  import { brand, scale, themes, toCssVarName, zIndex, type ThemeTokens } from '$lib/design/tokens';
  import { brandUsage, scaleUsage, themeUsage, zIndexUsage } from '$lib/design/tokenUsage';

  const brandKeys = Object.keys(brand) as (keyof typeof brand)[];
  const themeKeys = Object.keys(themes.light) as (keyof ThemeTokens)[];
  // Tokens whose value isn't a paintable color get listed as text, not swatches.
  const nonColorKeys = new Set<keyof ThemeTokens>([
    'lineartFilter',
    'lineartBlend',
    'floatShadow',
    'floatShadowFlyout',
  ]);
  const colorKeys = themeKeys.filter((k) => !nonColorKeys.has(k));

  const scaleKeys = Object.keys(scale) as (keyof typeof scale)[];
  const spaceKeys = scaleKeys.filter((k) => k.startsWith('space'));
  const radiusKeys = scaleKeys.filter((k) => k.startsWith('radius') && k !== 'radiusPill');
  const fontSizeKeys = scaleKeys.filter((k) => k.startsWith('fontSize'));
  const shadowKeys = scaleKeys.filter((k) => k.startsWith('shadow'));
  const durationKeys = scaleKeys.filter((k) => k.startsWith('duration'));
  // Already authored low-to-high in tokens.ts; render it in that order so the
  // page shows the stacking order, not just the values.
  const zIndexKeys = Object.keys(zIndex) as (keyof typeof zIndex)[];

  const cssVar = (key: string) => `var(${toCssVarName(key)})`;

  // --brand-rgb is a channel triplet for rgba() composition, not a complete
  // color — a bare var() in `background` is invalid CSS and computes as
  // transparent (design.spec.ts asserts every swatch paints).
  const brandSwatchFill = (key: string) =>
    key === 'brandRgb' ? `rgb(${cssVar(key)})` : cssVar(key);

  const weightSpecimens = [
    { weight: 700, token: 'fontWeightBold', sample: 'Let them make a mess.' },
    { weight: 600, token: 'fontWeightSemibold', sample: 'Settings, not a paywall' },
    { weight: 500, token: 'fontWeightMedium', sample: 'Sound · Night Mode · Advanced Controls' },
  ] as const;

  const easeKeys = ['easePop', 'easeGlide'] as const;
</script>

<section>
  <h3>Brand</h3>
  <div class="swatch-grid">
    {#each brandKeys as key (key)}
      <div class="swatch-card">
        <div class="swatch" style:background={brandSwatchFill(key)}></div>
        <code>{toCssVarName(key)}</code>
        <span class="value">{brand[key]}</span>
        <span class="usage">{brandUsage[key]}</span>
      </div>
    {/each}
  </div>
</section>

<section>
  <h3>Unthemed fills</h3>
  <p>Constant chrome color — it reads the same on both papers, so it has no light/dark pair.</p>
  <div class="swatch-grid">
    <div class="swatch-card">
      <div class="swatch" style:background={cssVar('clearGradientRest')}></div>
      <code>--clear-gradient-rest</code>
      <span class="value">{scale.clearGradientRest}</span>
      <span class="usage">{scaleUsage.clearGradientRest}</span>
    </div>
  </div>
</section>

<section>
  <h3>Theme colors</h3>
  <p>Swatches paint the live CSS variable — flip the theme above to see the dark values.</p>
  <div class="swatch-grid">
    {#each colorKeys as key (key)}
      <div class="swatch-card">
        <div class="swatch" style:background={cssVar(key)}></div>
        <code>{toCssVarName(key)}</code>
        <span class="value">{themes.light[key]} · {themes.dark[key]}</span>
        <span class="usage">{themeUsage[key]}</span>
      </div>
    {/each}
  </div>
  <h4>Non-color theme tokens</h4>
  <ul class="raw-list">
    {#each [...nonColorKeys] as key (key)}
      <li>
        <code>{toCssVarName(key)}</code>
        <span class="value">{themes.light[key]} · {themes.dark[key]}</span>
        <span class="usage">{themeUsage[key]}</span>
      </li>
    {/each}
  </ul>
</section>

<section>
  <h3>Spacing</h3>
  <div class="row-list">
    {#each spaceKeys as key (key)}
      <div class="scale-row">
        <div class="row-head">
          <code>{toCssVarName(key)}</code>
          <span class="usage">{scaleUsage[key]}</span>
        </div>
        <div class="space-bar" style:width={cssVar(key)}></div>
        <span class="value">{scale[key]}</span>
      </div>
    {/each}
  </div>
</section>

<section>
  <h3>Radius</h3>
  <div class="radius-grid">
    {#each radiusKeys as key (key)}
      <div class="swatch-card">
        <div class="radius-box" style:border-radius={cssVar(key)}></div>
        <code>{toCssVarName(key)}</code>
        <span class="value">{scale[key]}</span>
        <span class="usage">{scaleUsage[key]}</span>
      </div>
    {/each}
    <div class="swatch-card">
      <div class="radius-box pill" style:border-radius={cssVar('radiusPill')}></div>
      <code>--radius-pill</code>
      <span class="value">{scale.radiusPill}</span>
      <span class="usage">{scaleUsage.radiusPill}</span>
    </div>
  </div>
  <h4>Border width</h4>
  <div class="radius-grid">
    <div class="swatch-card">
      <div class="border-box"></div>
      <code>{toCssVarName('borderWidth')}</code>
      <span class="value">{scale.borderWidth}</span>
      <span class="usage">{scaleUsage.borderWidth}</span>
    </div>
  </div>
</section>

<section>
  <h3>Type scale</h3>
  <p>
    Six body steps plus the display tier, one role each — if two steps both look right, take the
    smaller.
  </p>
  <div class="row-list">
    {#each fontSizeKeys as key (key)}
      <div class="scale-row">
        <div class="row-head">
          <code>{toCssVarName(key)}</code>
          <span class="usage">{scaleUsage[key]}</span>
        </div>
        <span class="type-sample" style:font-size={cssVar(key)}>Splotch says hello</span>
        <span class="value">{scale[key]}</span>
      </div>
    {/each}
    <div class="scale-row">
      <div class="row-head">
        <code>{toCssVarName('inputFontSize')}</code>
        <span class="usage">{scaleUsage.inputFontSize}</span>
      </div>
      <span class="type-sample" style:font-size={cssVar('inputFontSize')}>Splotch says hello</span>
      <span class="value">{scale.inputFontSize}</span>
    </div>
    <div class="scale-row">
      <div class="row-head">
        <code>{toCssVarName('fontFamily')}</code>
        <span class="usage">{scaleUsage.fontFamily}</span>
      </div>
      <span class="type-sample" style:font-family={cssVar('fontFamily')}>Splotch says hello</span>
      <span class="value">{scale.fontFamily}</span>
    </div>
    <div class="scale-row">
      <div class="row-head">
        <code>{toCssVarName('fontMono')}</code>
        <span class="usage">{scaleUsage.fontMono}</span>
      </div>
      <span class="type-sample" style:font-family={cssVar('fontMono')}>Splotch says hello</span>
      <span class="value">{scale.fontMono}</span>
    </div>
  </div>
  <h4>Weights</h4>
  <p>Body prose stays at the untokenized 400 default; everything heavier goes through a token.</p>
  <div class="row-list">
    {#each weightSpecimens as specimen (specimen.weight)}
      <div class="scale-row">
        <div class="row-head">
          <code>{toCssVarName(specimen.token)}</code>
          <span class="usage">{scaleUsage[specimen.token]}</span>
        </div>
        <span class="type-sample" style:font-weight={specimen.weight}>{specimen.sample}</span>
        <span class="value">{specimen.weight}</span>
      </div>
    {/each}
  </div>
</section>

<section>
  <h3>Elevation</h3>
  <div class="shadow-grid">
    {#each shadowKeys as key (key)}
      <div class="swatch-card">
        <div class="shadow-box" style:box-shadow={cssVar(key)}></div>
        <code>{toCssVarName(key)}</code>
        <span class="usage">{scaleUsage[key]}</span>
      </div>
    {/each}
    <div class="swatch-card">
      <div class="shadow-box float" style:box-shadow={cssVar('floatShadow')}></div>
      <code>--float-shadow</code>
      <span class="usage">{themeUsage.floatShadow}</span>
    </div>
    <div class="swatch-card">
      <div class="shadow-box float" style:box-shadow={cssVar('floatShadowFlyout')}></div>
      <code>--float-shadow-flyout</code>
      <span class="usage">{themeUsage.floatShadowFlyout}</span>
    </div>
  </div>
</section>

<section>
  <h3>Motion</h3>
  <p>
    Two curves: the springy overshoot for anything that pops in or celebrates, the glide for
    anything that settles or leaves. Press states scale down (0.9–0.96); hovers swap to a wash or
    hover token. Transitions pair a curve with a duration token; a one-shot celebration keyframe may
    carry its own tuned timing. The lanes run each easing curve on a loop.
  </p>
  <div class="motion-lanes">
    {#each easeKeys as key (key)}
      <div class="motion-lane-col">
        <div class="motion-lane">
          <span class="lane-dot" style:animation-timing-function={cssVar(key)}></span>
        </div>
        <code>{toCssVarName(key)}</code>
        <span class="usage">{scaleUsage[key]}</span>
      </div>
    {/each}
  </div>
  <ul class="raw-list">
    {#each durationKeys as key (key)}
      <li>
        <code>{toCssVarName(key)}</code>
        <span class="value">{scale[key]}</span>
        <span class="usage">{scaleUsage[key]}</span>
      </li>
    {/each}
  </ul>
</section>

<section>
  <h3>Stacking</h3>
  <p>
    The cross-component chrome order, low to high — one list, but not one stacking context, so a
    bigger number doesn't always win. Everything resolves in the root context except
    <code>--z-flyout</code>, which only orders the flyout inside <code>.actions-panel</code>
    (<code>position: fixed</code> + <code>--z-panel</code>): raising it past
    <code>--z-banner</code> would do nothing, because the panel caps its whole subtree. That makes
    the <code>--z-panel</code>/<code>--z-flyout</code> tie inert; the
    <code>--z-clear-button</code>/<code>--z-notch</code> tie is real and resolved by DOM order.
  </p>
  <ul class="raw-list">
    {#each zIndexKeys as key (key)}
      <li>
        <code>{toCssVarName(key)}</code>
        <span class="value">{zIndex[key]}</span>
        <span class="usage">{zIndexUsage[key]}</span>
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
    margin: var(--space-4) 0 var(--space-2);
  }

  code {
    font-size: var(--font-size-xs);
    color: var(--brand-text);
  }

  /* Both stay on --text-soft: it is pinned to hold 4.5:1 at these 12px sizes
     (the axe scan in a11y.spec.ts enforces it). */
  .value,
  .usage {
    font-size: var(--font-size-xs);
    color: var(--text-soft);
  }

  .usage {
    line-height: 1.4;
  }

  .swatch-grid,
  .radius-grid,
  .shadow-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--space-3);
  }

  .swatch-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .swatch {
    height: var(--space-8);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
  }

  .row-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .scale-row {
    display: grid;
    grid-template-columns: 16rem 1fr 6rem;
    align-items: center;
    gap: var(--space-3);
  }

  .row-head {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .space-bar {
    height: var(--space-4);
    background: var(--brand);
    /* Demo bar, not a control: the radius ramp's smallest step would pill the
       narrowest bars, so this keeps a raw sliver of rounding. */
    border-radius: 2px;
  }

  .type-sample {
    color: var(--text-strong);
  }

  .radius-box {
    height: var(--space-8);
    background: var(--brand-wash);
    border: 2px solid var(--brand);
  }

  .radius-box.pill {
    height: var(--space-6);
  }

  .border-box {
    height: var(--space-8);
    background: var(--surface);
    border: var(--border-width) solid var(--brand);
    border-radius: var(--radius-md);
  }

  .shadow-box {
    height: var(--space-8);
    background: var(--surface);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-2);
  }

  .shadow-box.float {
    background: var(--float-surface);
    border: 1px solid var(--float-border);
  }

  .motion-lanes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-4);
    max-width: 70ch;
    margin-bottom: var(--space-4);
    /* Slow enough to read each curve's shape — demo pacing, not a motion token. */
    --lane-demo-duration: 1.2s;
  }

  .motion-lane-col {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .motion-lane {
    position: relative;
    height: var(--space-8);
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

  .raw-list .usage {
    display: block;
  }
</style>
