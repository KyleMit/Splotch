<script module lang="ts">
  import { deferredIconMarkup, ensureDeferredIcons } from './iconRegistry.svelte';
  import { COLORFUL_ICONS } from './icon-meta';
  import { iconNameFromPath, type CommonIconName } from './iconTypes';

  // Full-color "spot" icons carry their own palette, so callers that tint
  // monochrome icons with a CSS `filter` must leave these alone. We tag them
  // with `icon-color` so those filter rules can opt out (see ActionsPanel).
  // COLORFUL_ICONS is generated from each SVG's painted hues (gen:icon-names);
  // the hand list below holds the monochrome icons that still opt out because
  // they tint themselves via currentColor or theme vars. Icon.svelte.test.ts
  // keeps the generated list fresh and this list free of anything the
  // classifier would have found on its own.
  const SELF_TINTING_ICONS: readonly CommonIconName[] = [
    'ink-splotch',
    // Dottie paints her brand fill through var(--brand, #hex), which the chroma
    // classifier does not read as a painted hue.
    'dottie-another-idea',
    'dottie-bright',
    'dottie-giggle',
    'dottie-hiccup',
    'dottie-kind-eyes',
    'dottie-lean',
    'dottie-question',
    'dottie-retry',
    'dottie-stumped',
    'dottie-sunny',
    // The stroke glyph inherits its caller's ink instead of the modal fill override.
    'refresh',
    // Some (brush-pen, brush-crayon, line-weight-brush) mix a fixed palette with
    // currentColor ink parts that ActionsPanel tints to the active drawing color.
    'line-weight-brush',
    'line-weight-eraser',
    'release-fixed',
    'release-improved',
    'release-new',
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
  ];
  export const COLOR_ICONS = new Set<CommonIconName>([...COLORFUL_ICONS, ...SELF_TINTING_ICONS]);
  /** The monochrome opt-outs alone, for the guard that keeps them out of the generated list. */
  export const SELF_TINTING_ICON_NAMES = SELF_TINTING_ICONS;

  // The exclusions must be spelled out literally here — Vite resolves
  // import.meta.glob statically — but NON_RENDERABLE_ICONS in iconTypes.ts is
  // the authoritative list; keep the two in step. The glob is deliberately not
  // recursive: web/src/lib/icons/deferred/ holds the icons only lazily loaded
  // UI renders, and deferredIcons.ts registers those off the startup path
  // (ADR-0164).
  const modules = import.meta.glob(['../icons/*.svg', '!../icons/splotchy.svg'], {
    eager: true,
    query: '?raw',
    import: 'default',
  });

  const icons = Object.fromEntries(
    Object.entries(modules).map(([path, src]) => [iconNameFromPath(path), src as string])
  ) as Record<CommonIconName, string>;

  /** Every name on the startup path, sorted — the /design styleguide pairs it with DEFERRED_ICON_NAMES. */
  export const STARTUP_ICON_NAMES = Object.keys(icons).sort() as CommonIconName[];
</script>

<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements';

  interface Props extends HTMLAttributes<HTMLSpanElement> {
    name: CommonIconName;
  }
  let { name, class: className, ...rest }: Props = $props();

  const markup = $derived(icons[name] ?? deferredIconMarkup(name));

  // A consumer that names a deferred icon imports deferredIcons.ts itself
  // (deferredIcons.test.ts), so this fires only for a name arriving through
  // untyped data; the registry fills and the icon re-renders.
  $effect(() => {
    if (markup === undefined) void ensureDeferredIcons();
  });
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
