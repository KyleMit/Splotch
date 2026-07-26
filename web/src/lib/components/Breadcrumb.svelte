<script lang="ts">
  import Icon from './Icon.svelte';

  interface Props {
    // Label for the current (non-linked) page at the end of the trail.
    current: string;
  }
  let { current }: Props = $props();
</script>

<nav class="breadcrumb" aria-label="Breadcrumb">
  <a href="/" class="crumb">
    <Icon name="home" class="crumb-icon" />
    <span>Home</span>
  </a>
  <span class="crumb-sep" aria-hidden="true">/</span>
  <span class="crumb crumb-current" aria-current="page">{current}</span>
</nav>

<style>
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 20px;
    font-size: var(--font-size-md);
    font-weight: 600;
  }

  .crumb {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--brand-text);
    text-decoration: none;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    transition: background var(--duration-fast) ease;
  }

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it stuck until the next tap elsewhere. */
  @media (hover: hover) {
    a.crumb:hover {
      background: var(--brand-wash);
    }
  }

  /* currentColor (not a filter chain) so the icon tracks the themed link color. */
  :global(.crumb .crumb-icon) {
    width: 16px;
    height: 16px;
  }

  :global(.crumb .crumb-icon svg) {
    fill: currentColor;
  }

  .crumb-sep {
    color: var(--text-faint);
  }

  /* Hardcoded #666, not --text-mid, for the light-pinned host: /admin's
     background is a hardcoded #f5f5f5, so --text-mid's dark-theme value
     (#b3b1bf) would drop to 1.9:1 there, while #666 clears 4.5:1 (the old
     --text-faint #999 was a 2.6:1 axe serious). #666 is only safe on a light
     background — it is 3.1:1 on the dark --app-bg — so the themed hosts (the
     /dev harnesses) override this with var(--text-mid), whose light value is
     this same #666. A themed host that adds a breadcrumb needs that override. */
  .crumb-current {
    color: #666;
    cursor: default;
  }
</style>
