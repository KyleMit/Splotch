<script lang="ts">
  import splotchyUrl from '../icons/splotchy.svg';
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends HTMLAttributes<HTMLSpanElement> {
    class?: string;
  }
  let { class: className = '', ...rest }: Props = $props();
</script>

<span class="{className} icon-color" {...rest} data-icon="splotchy">
  <img src={splotchyUrl} alt="" />
</span>

<style>
  span {
    display: inline-flex;
    line-height: 0;
  }
  img {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
