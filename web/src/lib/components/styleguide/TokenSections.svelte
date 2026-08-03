<script lang="ts">
  import { brand, scale, themes, toCssVarName, zIndex, type ThemeTokens } from '$lib/design/tokens';

  const themeKeys = Object.keys(themes.light) as (keyof ThemeTokens)[];
  // Tokens whose value isn't a paintable color get listed as text, not swatches.
  const nonColorKeys = new Set<keyof ThemeTokens>([
    'lineartFilter',
    'lineartBlend',
    'floatShadow',
    'floatShadowFlyout',
  ]);
  const colorKeys = themeKeys.filter((k) => !nonColorKeys.has(k));

  const spaceKeys = Object.keys(scale).filter((k) => k.startsWith('space'));
  const radiusKeys = Object.keys(scale).filter((k) => k.startsWith('radius') && k !== 'radiusPill');
  const fontSizeKeys = Object.keys(scale).filter((k) => k.startsWith('fontSize'));
  const shadowKeys = Object.keys(scale).filter((k) => k.startsWith('shadow'));
  const motionEntries = Object.entries(scale).filter(
    ([k]) => k.startsWith('duration') || k.startsWith('ease')
  );
  // Already authored low-to-high in tokens.ts; render it in that order so the
  // page shows the stacking order, not just the values.
  const zIndexEntries = Object.entries(zIndex);

  const cssVar = (key: string) => `var(${toCssVarName(key)})`;

  const weightSpecimens = [
    { weight: 700, note: 'headings', sample: 'Let them make a mess.' },
    { weight: 600, note: '--font-weight-semibold', sample: 'Settings, not a paywall' },
    { weight: 500, note: 'labels', sample: 'Sound · Night Mode · Advanced Controls' },
    { weight: 400, note: 'body', sample: 'Draw with big, chunky, crayon-like strokes.' },
  ] as const;

  const motionLanes = [
    { token: 'easePop', note: 'overshoot · dialog fly-ins' },
    { token: 'easeGlide', note: 'settle · the polaroid, the clear ripple' },
    { token: 'easePopStrong', note: 'celebration · swatch ring, Clear Button' },
  ] as const;
</script>

<section>
  <h2>Brand</h2>
  <div class="swatch-grid">
    {#each Object.entries(brand).filter(([k]) => k !== 'brandTintFilter') as [key, value] (key)}
      <div class="swatch-card">
        <div class="swatch" style:background={cssVar(key)}></div>
        <code>{toCssVarName(key)}</code>
        <span class="value">{value}</span>
      </div>
    {/each}
  </div>
</section>

<section>
  <h2>Unthemed fills</h2>
  <p>Constant chrome color — it reads the same on both papers, so it has no light/dark pair.</p>
  <div class="swatch-grid">
    <div class="swatch-card">
      <div class="swatch" style:background={cssVar('clearGradientRest')}></div>
      <code>--clear-gradient-rest</code>
      <span class="value">{scale.clearGradientRest}</span>
    </div>
  </div>
</section>

<section>
  <h2>Theme colors</h2>
  <p>Swatches paint the live CSS variable — flip the theme above to see the dark values.</p>
  <div class="swatch-grid">
    {#each colorKeys as key (key)}
      <div class="swatch-card">
        <div class="swatch" style:background={cssVar(key)}></div>
        <code>{toCssVarName(key)}</code>
        <span class="value">{themes.light[key]} · {themes.dark[key]}</span>
      </div>
    {/each}
  </div>
  <h3>Non-color theme tokens</h3>
  <ul class="raw-list">
    {#each [...nonColorKeys] as key (key)}
      <li>
        <code>{toCssVarName(key)}</code>
        <span class="value">{themes.light[key]} · {themes.dark[key]}</span>
      </li>
    {/each}
  </ul>
</section>

<section>
  <h2>Spacing</h2>
  <div class="row-list">
    {#each spaceKeys as key (key)}
      <div class="scale-row">
        <code>{toCssVarName(key)}</code>
        <div class="space-bar" style:width={cssVar(key)}></div>
        <span class="value">{scale[key as keyof typeof scale]}</span>
      </div>
    {/each}
  </div>
</section>

<section>
  <h2>Radius</h2>
  <div class="radius-grid">
    {#each radiusKeys as key (key)}
      <div class="swatch-card">
        <div class="radius-box" style:border-radius={cssVar(key)}></div>
        <code>{toCssVarName(key)}</code>
        <span class="value">{scale[key as keyof typeof scale]}</span>
      </div>
    {/each}
    <div class="swatch-card">
      <div class="radius-box pill" style:border-radius={cssVar('radiusPill')}></div>
      <code>--radius-pill</code>
      <span class="value">{scale.radiusPill}</span>
    </div>
  </div>
  <h3>Border width</h3>
  <div class="radius-grid">
    <div class="swatch-card">
      <div class="border-box"></div>
      <code>{toCssVarName('borderWidth')}</code>
      <span class="value">{scale.borderWidth}</span>
    </div>
  </div>
</section>

<section>
  <h2>Type scale</h2>
  <div class="row-list">
    {#each fontSizeKeys as key (key)}
      <div class="scale-row">
        <code>{toCssVarName(key)}</code>
        <span class="type-sample" style:font-size={cssVar(key)}>Splotch says hello</span>
        <span class="value">{scale[key as keyof typeof scale]}</span>
      </div>
    {/each}
    <div class="scale-row">
      <code>{toCssVarName('inputFontSize')}</code>
      <span class="type-sample" style:font-size={cssVar('inputFontSize')}>Splotch says hello</span>
      <span class="value">{scale.inputFontSize}</span>
    </div>
    <div class="scale-row">
      <code>{toCssVarName('fontFamily')}</code>
      <span class="type-sample" style:font-family={cssVar('fontFamily')}>Splotch says hello</span>
      <span class="value">{scale.fontFamily}</span>
    </div>
    <div class="scale-row">
      <code>{toCssVarName('fontMono')}</code>
      <span class="type-sample" style:font-family={cssVar('fontMono')}>Splotch says hello</span>
      <span class="value">{scale.fontMono}</span>
    </div>
  </div>
  <h3>Weights</h3>
  <p>Only 600 carries a token; 500 and 700 are written raw where they appear.</p>
  <div class="row-list">
    {#each weightSpecimens as specimen (specimen.weight)}
      <div class="scale-row">
        <code>{specimen.note}</code>
        <span class="type-sample" style:font-weight={specimen.weight}>{specimen.sample}</span>
        <span class="value">{specimen.weight}</span>
      </div>
    {/each}
  </div>
</section>

<section>
  <h2>Elevation</h2>
  <div class="shadow-grid">
    {#each shadowKeys as key (key)}
      <div class="swatch-card">
        <div class="shadow-box" style:box-shadow={cssVar(key)}></div>
        <code>{toCssVarName(key)}</code>
      </div>
    {/each}
    <div class="swatch-card">
      <div class="shadow-box float" style:box-shadow={cssVar('floatShadow')}></div>
      <code>--float-shadow</code>
    </div>
    <div class="swatch-card">
      <div class="shadow-box float" style:box-shadow={cssVar('floatShadowFlyout')}></div>
      <code>--float-shadow-flyout</code>
    </div>
  </div>
</section>

<section>
  <h2>Motion</h2>
  <p>
    Springy overshoot for kid moments, glides for settles. Press states scale down (0.9–0.96);
    hovers swap to a wash or hover token. The lanes run each easing curve on a loop.
  </p>
  <div class="motion-lanes">
    {#each motionLanes as lane (lane.token)}
      <div class="motion-lane-col">
        <div class="motion-lane">
          <span class="lane-dot" style:animation-timing-function={cssVar(lane.token)}></span>
        </div>
        <code>{toCssVarName(lane.token)}</code>
        <span class="value">{lane.note}</span>
      </div>
    {/each}
  </div>
  <ul class="raw-list">
    {#each motionEntries as [key, value] (key)}
      <li><code>{toCssVarName(key)}</code> <span class="value">{value}</span></li>
    {/each}
  </ul>
</section>

<section>
  <h2>Stacking</h2>
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
    {#each zIndexEntries as [key, value] (key)}
      <li><code>{toCssVarName(key)}</code> <span class="value">{value}</span></li>
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
    font-size: var(--font-size-md);
  }

  h2 {
    color: var(--text-strong);
    font-size: var(--font-size-xl);
    margin-bottom: var(--space-2);
  }

  h3 {
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
    grid-template-columns: 10rem 1fr 6rem;
    align-items: center;
    gap: var(--space-3);
  }

  .space-bar {
    height: var(--space-4);
    background: var(--brand);
    border-radius: var(--radius-xs);
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
</style>
