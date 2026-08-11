<script lang="ts">
  import { scale, toCssVarName, zIndex } from '$lib/design/tokens';
  import { scaleUsage, themeUsage, zIndexUsage } from '$lib/design/tokenUsage';

  const cssVar = (key: string) => `var(${toCssVarName(key)})`;

  type ScaleKey = keyof typeof scale;
  const scaleKeys = Object.keys(scale) as ScaleKey[];
  const keysStartingWith = <P extends string>(prefix: P) =>
    scaleKeys.filter((k): k is Extract<ScaleKey, `${P}${string}`> => k.startsWith(prefix));
  const spaceKeys = keysStartingWith('space');
  const radiusKeys = keysStartingWith('radius');
  const shadowKeys = keysStartingWith('shadow');
  const durationKeys = keysStartingWith('duration');
  // Already authored low-to-high in tokens.ts; render it in that order so the
  // page shows the stacking order, not just the values.
  const zIndexKeys = Object.keys(zIndex) as (keyof typeof zIndex)[];

  // Short roles beside each specimen; the mapped types make the compiler
  // demand one for every token on the ramp.
  const radiusShorts: Record<Extract<ScaleKey, `radius${string}`>, string> = {
    radiusSm: 'inline chips',
    radiusMd: 'controls',
    radiusLg: 'cards & sheets',
    radiusPill: 'pills & toggle tracks',
  };
  const durationShorts: Record<Extract<ScaleKey, `duration${string}`>, string> = {
    durationFast: 'presses & hovers',
    durationBase: 'standard transitions',
    durationSlow: 'whole-surface entrances',
  };

  const easeKeys = ['easePop', 'easeGlide'] as const;
</script>

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
    1–2 inside a control · 3–4 between controls and card padding · 5–6 tap targets and gutters · 7–8
    section and page breaks.
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
    hover token. Tuned one-shot choreography — the AI reveal, the polaroid flight — carries its own
    timing. The lanes run each easing curve on a loop.
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

<style>
  section {
    margin-top: 48px;
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
    margin: 8px 0 0;
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
