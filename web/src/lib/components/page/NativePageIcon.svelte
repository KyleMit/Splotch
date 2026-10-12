<script lang="ts">
  import type { ComponentProps } from 'svelte';
  import Icon from '../Icon.svelte';
  import type WebPageIcon from './WebPageIcon.svelte';
  import '$lib/components/deferredIcons';
  let props: ComponentProps<typeof WebPageIcon> = $props();
</script>

<Icon {...props} />
