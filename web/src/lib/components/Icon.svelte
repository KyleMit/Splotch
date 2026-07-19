<script lang="ts">
  import type { CommonIconName } from './iconTypes';

  const modules = import.meta.glob(['../icons/*.svg', '!../icons/splotchy.svg'], {
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
    'crayon',
    'eraser',
    'line-weight',
    'line-weight-eraser',
    'magic-brush',
    'more-colors',
    'shapes',
    'sweep-icon',
    'undo',
    'wand-stars',
    // Stroke-size previews carry their own coloring — the pen sizes via
    // currentColor (the active ink color), the eraser sizes and its
    // line-weight-eraser trigger via theme vars (--paper / --hole-stroke) —
    // so they must skip the monochrome tint filter too.
    'size-1',
    'size-2',
    'size-3',
    'size-4',
    'size-5',
    'eraser-size-1',
    'eraser-size-2',
    'eraser-size-3',
    'eraser-size-4',
    'eraser-size-5',
  ]);

  interface Props {
    name: CommonIconName;
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
