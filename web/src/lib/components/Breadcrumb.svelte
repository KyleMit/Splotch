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
    font-size: 14px;
    font-weight: 600;
  }

  .crumb {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #7c4dcf;
    text-decoration: none;
    padding: 4px 8px;
    border-radius: 8px;
    transition: background 0.15s ease;
  }

  a.crumb:hover {
    background: #f0e9fb;
  }

  :global(.crumb .crumb-icon) {
    width: 16px;
    height: 16px;
    filter: invert(33%) sepia(58%) saturate(1093%) hue-rotate(238deg) brightness(88%) contrast(89%);
  }

  .crumb-sep {
    color: #ccc;
  }

  .crumb-current {
    color: #999;
    cursor: default;
  }
</style>
