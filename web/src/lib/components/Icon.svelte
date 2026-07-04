<script lang="ts">
  import type { IconName } from './icon-names';

  const modules = import.meta.glob('../icons/*.svg', {
    eager: true,
    query: '?raw',
    import: 'default',
  });

  const icons: Record<string, string> = {};
  for (const [path, src] of Object.entries(modules)) {
    const key = (path.split('/').pop() ?? '').replace('.svg', '');
    icons[key] = src as string;
  }

  // Full-color "spot" icons carry their own palette, so callers that tint
  // monochrome icons with a CSS `filter` must leave these alone. We tag them
  // with `icon-color` so those filter rules can opt out (see ActionsPanel).
  const COLOR_ICONS = new Set([
    'camera',
    'eraser',
    'line-weight',
    'line-weight-eraser',
    'palette',
    'shapes',
    'splotchy',
    'sweep-icon',
    'undo',
    'wand-stars',
    // Stroke-size lines use currentColor (driven by the active pen/eraser color),
    // so they must skip the monochrome tint filter too.
    'size-1',
    'size-2',
    'size-3',
    'size-4',
    'size-5',
  ]);

  interface Props {
    name: IconName;
    class?: string;
    [key: string]: unknown;
  }
  let { name, class: className = '', ...rest }: Props = $props();

  const markup = $derived(icons[name] ?? '');
  const colorClass = $derived(COLOR_ICONS.has(name) ? ' icon-color' : '');
</script>

<!-- data-icon exposes the icon identity to the DOM: the SVG goes in via {@html}, so
     the name is otherwise invisible to tests (and to the {@html} hydration caveat in
     .claude/rules/svelte.md). -->
<!-- eslint-disable-next-line svelte/no-at-html-tags markup is a first-party SVG string from the build-generated icon map -->
<span class="{className}{colorClass}" {...rest} data-icon={name}>{@html markup}</span>

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
