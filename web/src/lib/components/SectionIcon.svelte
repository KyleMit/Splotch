<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';
  import Icon from './Icon.svelte';
  import SplotchyIcon from './SplotchyIcon.svelte';
  import type { IconName } from './icon-names';

  interface Props extends HTMLAttributes<HTMLSpanElement> {
    icon: IconName;
    // Narrowed from ClassValue to match SplotchyIcon, which interpolates it
    // into a class string.
    class?: string;
  }
  let { icon, class: className = '', ...rest }: Props = $props();
</script>

{#if icon === 'splotchy'}
  <SplotchyIcon class={className} {...rest} />
{:else}
  <Icon name={icon} class={className} {...rest} />
{/if}
