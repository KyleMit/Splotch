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

  // Full-color "spot" icons carry their own palette, so callers that tint
  // monochrome icons with a CSS `filter` must leave these alone. We tag them
  // with `icon-color` so those filter rules can opt out (see ActionsPanel).
  const COLOR_ICONS = new Set([
    'camera', 'eraser', 'line-weight', 'shapes', 'sweep-icon', 'undo', 'wand-stars'
  ]);

  let { name, class: className = '', ...rest } = $props();

  const markup = $derived(icons[name] ?? '');
  const colorClass = $derived(COLOR_ICONS.has(name) ? ' icon-color' : '');
</script>

<span class="{className}{colorClass}" {...rest}>{@html markup}</span>

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
