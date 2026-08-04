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
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
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
    color: var(--text-soft);
  }

  /* --text-soft holds contrast on the themed hosts (the /dev harnesses). A
     light-pinned host must override this: --text-soft's dark-theme value
     drops below 2:1 on a light ground. */
  .crumb-current {
    color: var(--text-soft);
    cursor: default;
  }
</style>
