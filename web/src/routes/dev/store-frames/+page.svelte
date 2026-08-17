<script lang="ts">
  import StoreFrame from './lib/StoreFrame.svelte';
  import FeatureGraphic from './lib/FeatureGraphic.svelte';
  import {
    FEATURE_GRAPHIC,
    STORE_TARGETS,
    storeTarget,
    type StoreTargetName,
  } from './lib/targets.ts';
  import { STORE_PAGES } from './lib/pages.ts';
  import { FEATURE_GRAPHIC_PAGE_PARAM, renderPath } from './lib/paths.ts';

  // Live design surface for the store screenshots: every page of the selected
  // target rendered by the real components at full store size, scaled to
  // preview width, hot-reloading with every edit to lib/. The generator
  // screenshots the same components through ./render.

  const PREVIEW_W = { portrait: 300, landscape: 640 } as const;

  let targetName = $state<StoreTargetName>('phone');
  const target = $derived(storeTarget(targetName));
  const scale = $derived(PREVIEW_W[target.orientation] / target.width);
  const featureScale = PREVIEW_W.landscape / FEATURE_GRAPHIC.width;
</script>

<svelte:head>
  <title>Store frames · Splotch dev</title>
</svelte:head>

<main>
  <header>
    <h1>Store frames</h1>
    <p>
      The live store-screenshot compositions. Edit anything under
      <code>routes/dev/store-frames/lib/</code> and this page hot-reloads; app captures come from
      <code>store-assets/captures/</code> (regenerate with <code>npm run gen:store-assets</code>,
      re-render finals only with <code>npm run gen:store-assets:frames</code>).
    </p>
    <div class="targets" role="group" aria-label="Store target">
      {#each STORE_TARGETS as entry (entry.name)}
        <button
          type="button"
          class:active={entry.name === targetName}
          onclick={() => (targetName = entry.name)}
        >
          {entry.name}
          <small>{entry.width}×{entry.height}</small>
        </button>
      {/each}
    </div>
  </header>

  <div class="grid">
    {#each STORE_PAGES as page (page.id)}
      <figure>
        <figcaption>
          <a href={renderPath(page.id, targetName)}>{page.id}</a>
        </figcaption>
        <div
          class="preview"
          style="width:{Math.round(target.width * scale)}px;height:{Math.round(
            target.height * scale
          )}px"
        >
          <div class="zoom" style="transform:scale({scale})">
            <StoreFrame {target} {page} />
          </div>
        </div>
      </figure>
    {/each}
    <figure>
      <figcaption>
        <a href={renderPath(FEATURE_GRAPHIC_PAGE_PARAM)}>feature-graphic</a>
      </figcaption>
      <div
        class="preview"
        style="width:{Math.round(FEATURE_GRAPHIC.width * featureScale)}px;height:{Math.round(
          FEATURE_GRAPHIC.height * featureScale
        )}px"
      >
        <div class="zoom" style="transform:scale({featureScale})">
          <FeatureGraphic />
        </div>
      </div>
    </figure>
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    padding: var(--space-6, 24px);
    font-family: var(--font-family, sans-serif);
    background: var(--app-bg, #f5f2fa);
    color: var(--text-strong, #2b2440);
  }

  header {
    max-width: 72ch;
    margin-bottom: var(--space-6, 24px);
  }

  h1 {
    margin-bottom: var(--space-2, 8px);
  }

  .targets {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2, 8px);
    margin-top: var(--space-4, 16px);
  }

  .targets button {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-2, 8px) var(--space-4, 16px);
    font: inherit;
    border: var(--border-width, 2px) solid currentColor;
    border-radius: var(--radius-md, 10px);
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .targets button.active {
    background: var(--text-strong, #2b2440);
    color: var(--app-bg, #f5f2fa);
  }

  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-6, 24px);
    align-items: flex-start;
  }

  figure {
    margin: 0;
  }

  figcaption {
    margin-bottom: var(--space-2, 8px);
    font-weight: 600;
  }

  figcaption a {
    color: inherit;
  }

  /* The frame renders at full store size and is scaled down visually; the
     preview box reserves exactly the scaled footprint. */
  .preview {
    overflow: hidden;
    border-radius: var(--radius-sm, 6px);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
  }

  .zoom {
    transform-origin: top left;
  }
</style>
