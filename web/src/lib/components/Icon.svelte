<script module lang="ts">
  import { iconNameFromPath, type CommonIconName } from './iconTypes';

  // Full-color "spot" icons carry their own palette, so callers that tint
  // monochrome icons with a CSS `filter` must leave these alone. We tag them
  // with `icon-color` so those filter rules can opt out (see ActionsPanel).
  // Some (brush-pen, brush-crayon, line-weight-brush) mix that fixed palette with currentColor
  // ink parts that ActionsPanel tints to the active drawing color.
  //
  // Guarded by Icon.svelte.test.ts: every icon the chroma classifier deems
  // colorful must appear here, so a newly added full-color SVG can't slip in
  // un-tagged and render wrongly tinted. The set is an allowed superset — the
  // stroke-size previews below are monochrome in their raw SVG but still opt
  // out because they tint via currentColor / theme vars.
  export const COLOR_ICONS = new Set<CommonIconName>([
    'appearance',
    'brush-crayon',
    'brush-eraser',
    'brush-magic',
    'brush-pen',
    'camera',
    'controls',
    'feedback',
    'line-weight-brush',
    'line-weight-eraser',
    'more-colors',
    'save-picture',
    'setup',
    'shapes',
    'sound',
    'trash-closed',
    'trash-open',
    'undo',
    'wand-stars',
    'whats-new',
    // Stroke-size previews carry their own coloring — the brush sizes via
    // currentColor (the active ink color), the eraser sizes and its
    // line-weight-eraser trigger via theme vars (--paper / --hole-stroke) —
    // so they must skip the monochrome tint filter too.
    'size-brush-1',
    'size-brush-2',
    'size-brush-3',
    'size-brush-4',
    'size-brush-5',
    'size-eraser-1',
    'size-eraser-2',
    'size-eraser-3',
    'size-eraser-4',
    'size-eraser-5',
  ]);

  // The exclusions must be spelled out literally here — Vite resolves
  // import.meta.glob statically — but NON_RENDERABLE_ICONS in iconTypes.ts is
  // the authoritative list; keep the two in step.
  const modules = import.meta.glob(['../icons/*.svg', '!../icons/splotchy.svg'], {
    eager: true,
    query: '?raw',
    import: 'default',
  });

  const icons = Object.fromEntries(
    Object.entries(modules).map(([path, src]) => [iconNameFromPath(path), src as string])
  ) as Record<CommonIconName, string>;

  /** Every name <Icon> can render, sorted — the /design styleguide iterates it. */
  export const ICON_NAMES = Object.keys(icons).sort() as CommonIconName[];
</script>

<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends HTMLAttributes<HTMLSpanElement> {
    name: CommonIconName;
  }
  let { name, class: className, ...rest }: Props = $props();

  const markup = $derived(icons[name]);
</script>

<!-- data-icon exposes the icon identity to the DOM: the SVG goes in via {@html}, so
     the name is otherwise invisible to tests (and to the {@html} hydration caveat in
     .claude/rules/svelte.md). -->
<!-- eslint-disable svelte/no-at-html-tags markup is a first-party SVG string from the build-generated icon map -->
<span class={[className, COLOR_ICONS.has(name) && 'icon-color']} {...rest} data-icon={name}
  >{@html markup}</span
>

<!-- eslint-enable svelte/no-at-html-tags -->

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
