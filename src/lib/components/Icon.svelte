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
    'camera', 'eraser', 'line-weight', 'line-weight-eraser', 'palette',
    'shapes', 'splotchy', 'sweep-icon', 'undo', 'wand-stars',
    // Stroke-size lines use currentColor (driven by the active pen/eraser color),
    // so they must skip the monochrome tint filter too.
    'size-1', 'size-2', 'size-3', 'size-4', 'size-5'
  ]);

  /** @type {{ name: import('./icon-names').IconName, class?: string, [key: string]: unknown }} */
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
