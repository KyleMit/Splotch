<script lang="ts">
  // Import only the SVG so the crash fallback does not depend on the icon registry
  // or app state. Inline markup also avoids an asset request during recovery.
  // Sharing this raw module with Icon's eager glob adds a small startup preload
  // chunk; that cost keeps the artwork canonical without pulling Icon into recovery.
  import dottieStumped from '$lib/icons/dottie-stumped.svg?raw';

  // The padded SVG needs this frame to retain the crash illustration's visual size.
  const DOTTIE_SIZE_PX = 128;

  interface Props {
    onRestart?: () => void;
  }
  let { onRestart = () => location.assign('/') }: Props = $props();
</script>

<div class="error-screen" role="alert">
  <!-- eslint-disable svelte/no-at-html-tags markup is a first-party SVG imported at build time -->
  <!-- Inline dimensions keep the SVG bounded if the component stylesheet fails. -->
  <div
    class="error-dottie"
    aria-hidden="true"
    style:width="{DOTTIE_SIZE_PX}px"
    style:height="{DOTTIE_SIZE_PX}px"
  >
    {@html dottieStumped}
  </div>
  <!-- eslint-enable svelte/no-at-html-tags -->
  <h1>Oops!</h1>
  <p>Something went wrong. Let's start a fresh drawing.</p>
  <button type="button" class="error-restart" onclick={onRestart}>Start over</button>
</div>

<style>
  .error-screen {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 24px;
    text-align: center;
    background: var(--app-bg, #fcfbf8);
    color: var(--text-strong, #333);
    font-family: var(--font-family, 'Quicksand Variable', system-ui, sans-serif);
  }

  .error-dottie :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }

  h1 {
    margin: 0;
    /* fallback is a fixed 32px near the token's fluid floor: the crash path
       must render a sane size even if tokens.css fails to load */
    font-size: var(--font-size-display, 32px);
    font-weight: var(--font-weight-bold, 700);
  }

  p {
    margin: 0;
    font-size: var(--font-size-md, 16px);
    color: var(--text-soft, #666);
    max-width: 320px;
  }

  .error-restart {
    margin-top: 8px;
    padding: 14px 32px;
    border: none;
    border-radius: var(--radius-pill, 999px);
    /* --brand-solid, not --brand: an 18px bold label sits below WCAG's
       large-text threshold, and --brand is only 3.4:1 under white. */
    background: var(--brand-solid, #7c50bb);
    color: var(--on-brand, #fff);
    font: inherit;
    font-size: var(--font-size-lg, 18px);
    font-weight: var(--font-weight-bold, 700);
    cursor: pointer;
  }

  .error-restart:active {
    transform: scale(0.97);
  }
</style>
