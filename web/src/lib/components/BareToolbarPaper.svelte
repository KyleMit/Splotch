<script lang="ts">
  import { fullscreenState } from '$lib/state/fullscreen.svelte';
</script>

<div class="rail-glass" aria-hidden="true"></div>
{#if fullscreenState.supported}<div class="fullscreen-glass" aria-hidden="true"></div>{/if}
<div class="margin-rule" aria-hidden="true"></div>
<div class="margin-rule second" aria-hidden="true"></div>

<style>
  .rail-glass,
  .fullscreen-glass,
  .margin-rule {
    display: none;
  }
  :global(html[data-toolbar='bare']) :is(.rail-glass, .fullscreen-glass, .margin-rule) {
    display: block;
    position: fixed;
    pointer-events: none;
    z-index: var(--z-toolbar-paper);
  }
  /* The rail glass stands in for the Buttons palette's opaque surface, so it
     must cover the Clear Accept Zone the way that surface does. The margin
     rules are that glass's printed edge, so they share the layer: below it the
     drag-to-clear flood covers them, and the rail reads as unruled paper. */
  :global(html[data-toolbar='bare']) :is(.rail-glass, .margin-rule) {
    z-index: var(--z-rail-glass);
  }
  .rail-glass {
    inset: 0 auto 0 0;
    width: calc(var(--palette-landscape-width) + var(--safe-area-left));
    background: var(--paper) var(--paper-texture);
  }
  .fullscreen-glass {
    top: var(--safe-area-top);
    left: calc(var(--palette-landscape-width) + var(--safe-area-left));
    width: 114px;
    height: 114px;
    background: var(--paper) var(--paper-texture);
    mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='114' height='114'%3E%3Cfilter id='f' x='-50%25' y='-50%25' width='200%25' height='200%25'%3E%3CfeGaussianBlur stdDeviation='10'/%3E%3C/filter%3E%3Crect x='-44' y='-44' width='114' height='114' rx='18' filter='url(%23f)'/%3E%3C/svg%3E");
  }
  .margin-rule {
    top: 0;
    bottom: 0;
    left: calc(var(--palette-landscape-width) + var(--safe-area-left));
    width: 3px;
    background: linear-gradient(
      90deg,
      transparent,
      var(--rule-ink) 30%,
      var(--rule-ink) 70%,
      transparent
    );
    mix-blend-mode: var(--rule-blend);
    opacity: var(--rule-opacity);
    /* Inlined, like the glass mask above: fetched by URL the fiber arrives after
       first paint and the rule appears a beat behind the toolbar it edges. */
    mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='600'%3E%3Cfilter id='a'%3E%3CfeTurbulence baseFrequency='0.6 0.035' numOctaves='3' seed='7' type='fractalNoise'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.9 0.45'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23a)'/%3E%3C/svg%3E");
    mask-size: 100% 600px;
  }
  .second {
    margin-left: 5px;
    opacity: var(--rule-secondary-opacity);
    mask-position: 0 137px;
  }
  @media (orientation: portrait) {
    .rail-glass {
      width: 100%;
      height: calc(var(--palette-portrait-height) + var(--safe-area-top));
    }
    .fullscreen-glass {
      top: calc(var(--palette-portrait-height) + var(--safe-area-top));
      left: var(--safe-area-left);
    }
    .margin-rule {
      left: 0;
      right: 0;
      bottom: auto;
      top: calc(var(--palette-portrait-height) + var(--safe-area-top));
      width: auto;
      height: 3px;
      background: linear-gradient(
        180deg,
        transparent,
        var(--rule-ink) 30%,
        var(--rule-ink) 70%,
        transparent
      );
      mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='8'%3E%3Cfilter id='a'%3E%3CfeTurbulence baseFrequency='0.035 0.6' numOctaves='3' seed='7' type='fractalNoise'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.9 0.45'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23a)'/%3E%3C/svg%3E");
      mask-size: 600px 100%;
    }
    .second {
      margin-left: 0;
      margin-top: 5px;
      mask-position: 137px 0;
    }
  }
  @media (orientation: landscape) and (max-height: 599.98px) {
    :global(html[data-toolbar='bare']) :is(.rail-glass, .margin-rule, .fullscreen-glass) {
      display: none;
    }
  }
  @supports (backdrop-filter: blur(1px)) {
    .rail-glass {
      background-color: rgb(var(--glass-tint-rgb) / var(--glass-rail));
      backdrop-filter: blur(4.6px);
    }
    .fullscreen-glass {
      background-color: rgb(var(--glass-tint-rgb) / var(--glass-strip));
      backdrop-filter: blur(5.1px);
    }
  }
  @media (prefers-reduced-transparency: reduce) {
    :is(.rail-glass, .fullscreen-glass) {
      background-color: var(--paper);
      backdrop-filter: none;
    }
  }
</style>
