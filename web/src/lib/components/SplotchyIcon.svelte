<script lang="ts">
  interface Props {
    class?: string;
    [key: string]: unknown;
  }
  let { class: className = '', ...rest }: Props = $props();
</script>

<span class="{className} icon-color" {...rest} data-icon="splotchy">
  <img src="/splotchy.svg" alt="" />
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
