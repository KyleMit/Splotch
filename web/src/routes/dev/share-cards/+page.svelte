<script lang="ts">
  import ShareCard from './lib/ShareCard.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Share card · Splotch dev</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<ShareCard card={data.card} />
