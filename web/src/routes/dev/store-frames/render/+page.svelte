<script lang="ts">
  import { onMount } from 'svelte';
  import { page as route } from '$app/state';
  import { QUICKSAND_FONT_FAMILY } from '$lib/fonts';
  import StoreFrame from '../lib/StoreFrame.svelte';
  import FeatureGraphic from '../lib/FeatureGraphic.svelte';
  import { STORE_TARGETS } from '../lib/targets.ts';
  import { STORE_PAGES } from '../lib/pages.ts';
  import { FEATURE_GRAPHIC_PAGE_PARAM } from '../lib/paths.ts';

  // The bare screenshot surface: renders exactly one composition at its exact
  // store pixel size and reports data-render-state so the generator can wait
  // deterministically instead of sleeping. ?page=<id>&target=<name>, or
  // ?page=feature-graphic (no target).

  // Every weight the frames set; the layout's lazy font warm races this page's
  // first paint, so the render surface loads them itself before reporting ready.
  const FRAME_FONT_WEIGHTS = [500, 600, 700];

  const pageParam = $derived(route.url.searchParams.get('page') ?? '');
  const targetParam = $derived(route.url.searchParams.get('target') ?? '');
  const isFeatureGraphic = $derived(pageParam === FEATURE_GRAPHIC_PAGE_PARAM);
  const storePage = $derived(STORE_PAGES.find((entry) => entry.id === pageParam));
  const target = $derived(STORE_TARGETS.find((entry) => entry.name === targetParam));

  const paramError = $derived.by(() => {
    if (isFeatureGraphic) return '';
    if (!storePage)
      return `Unknown page "${pageParam}" — expected a store page id or "${FEATURE_GRAPHIC_PAGE_PARAM}".`;
    if (!target) return `Unknown target "${targetParam}".`;
    return '';
  });

  let root: HTMLElement | undefined = $state();
  let renderState = $state<'pending' | 'ready' | 'error'>('pending');
  let assetError = $state('');

  onMount(async () => {
    if (paramError) {
      renderState = 'error';
      return;
    }
    await Promise.all(
      FRAME_FONT_WEIGHTS.map((weight) =>
        document.fonts.load(`${weight} 1em "${QUICKSAND_FONT_FAMILY}"`)
      )
    );
    const images = Array.from(root?.querySelectorAll('img') ?? []);
    const failures: string[] = [];
    await Promise.all(
      images.map((img) =>
        img.decode().catch(() => {
          failures.push(img.src);
        })
      )
    );
    if (failures.length > 0) {
      assetError = `Failed to load: ${failures.join(', ')} — captures come from npm run gen:store-assets.`;
      renderState = 'error';
      return;
    }
    renderState = 'ready';
  });
</script>

<svelte:head>
  <title>Store frame render · Splotch dev</title>
</svelte:head>

<div class="surface" bind:this={root} data-render-state={renderState}>
  {#if paramError || assetError}
    <p class="error">{paramError || assetError}</p>
  {:else if isFeatureGraphic}
    <FeatureGraphic />
  {:else if storePage && target}
    <StoreFrame {target} page={storePage} />
  {/if}
</div>

<style>
  .surface {
    position: absolute;
    top: 0;
    left: 0;
  }

  .error {
    width: max-content;
    max-width: 90vw;
    padding: var(--space-4, 16px);
    font-family: var(--font-family, sans-serif);
    color: var(--danger-text);
    background: var(--surface);
  }
</style>
