<script lang="ts">
  import Icon from './Icon.svelte';
  import SplotchyIcon from './SplotchyIcon.svelte';
  import type { IconName } from './icon-names';

  interface Props {
    icon: IconName;
    class?: string;
    [key: string]: unknown;
  }
  let { icon, class: className = '', ...rest }: Props = $props();
</script>

{#if icon === 'splotchy'}
  <SplotchyIcon class={className} {...rest} />
{:else}
  <Icon name={icon} class={className} {...rest} />
{/if}
