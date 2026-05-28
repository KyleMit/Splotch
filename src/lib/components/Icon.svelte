<script>
  const modules = import.meta.glob('../icons/*.svg', {
    eager: true,
    query: '?raw',
    import: 'default'
  });

  const icons = {};
  for (const [path, src] of Object.entries(modules)) {
    const key = path.split('/').pop().replace('.svg', '');
    icons[key] = src;
  }

  let { name, class: className = '', ...rest } = $props();

  const markup = $derived(icons[name] ?? '');
</script>

<span class={className} {...rest}>{@html markup}</span>

<style>
  span {
    display: inline-flex;
    line-height: 0;
  }
  span :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
