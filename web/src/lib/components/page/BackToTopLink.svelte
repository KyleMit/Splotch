<script lang="ts">
  import Icon from '$pageIcon';
</script>

<a class="back-to-top" href="#top"
  ><span class="back-blob" aria-hidden="true"><Icon name="chevron-left" class="back-icon" /></span
  >Back to top</a
>

<style>
  a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    color: var(--page-link);
    gap: 10px;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-bold);
  }

  .back-blob {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-blob-1);
    background: var(--brand-solid);
    color: var(--on-brand);
    box-shadow: var(--blob-shadow);
    transition:
      transform var(--duration-fast) var(--ease-pop),
      background var(--duration-fast) var(--ease-glide);
  }
  .back-blob :global(.back-icon) {
    width: 22px;
    height: 22px;
    transform: rotate(90deg);
  }
  .back-blob :global(svg) {
    fill: var(--on-brand);
  }
  .back-to-top:active .back-blob {
    transform: scale(0.94);
  }
  @media (hover: hover) {
    .back-to-top:hover .back-blob {
      background: var(--brand-solid-hover);
    }
  }
  :global(:root[data-reduce-motion]) .back-blob {
    transition: none;
  }
  :global(:root[data-reduce-motion]) .back-to-top:active .back-blob {
    transform: none;
  }
  @media (forced-colors: active) {
    .back-blob {
      border: 1px solid CanvasText;
    }
    .back-blob :global(svg) {
      fill: CanvasText;
    }
  }
</style>
