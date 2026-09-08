<script lang="ts">
  import {
    coverScrollportPadding,
    excludeScrollportGutter,
    observeContentEnd,
  } from '$lib/actions/scrollCue';

  import type { Snippet } from 'svelte';

  interface Props {
    /** Wrap a bounded scroller and render its end marker inside it. The fade
     *  then paints as a sibling overlay, independent of scrollport padding.
     *  Set --scroll-cue-height above ScrollCue: the scroller is the fade's
     *  sibling, so it cannot pass that inherited property to the fade. */
    children?: Snippet<[Snippet]>;
  }

  let { children }: Props = $props();

  let atEnd = $state(true);
</script>

{#snippet sentinel()}
  <div
    class="scroll-cue-sentinel"
    aria-hidden="true"
    use:observeContentEnd={(reached) => (atEnd = reached)}
  ></div>
{/snippet}

{#if children}
  <div class="scroll-cue-frame">
    {@render children(sentinel)}
    <div
      class="scroll-cue overlay"
      class:retired={atEnd}
      aria-hidden="true"
      use:excludeScrollportGutter
    ></div>
  </div>
{:else}
  {@render sentinel()}
  <div class="scroll-cue" class:retired={atEnd} aria-hidden="true" use:coverScrollportPadding></div>
{/if}

<style>
  .scroll-cue-sentinel {
    /* How far the end-of-content marker reaches back over the content it marks.
       Fractional layout leaves the true end of a scroll a sub-pixel *past* the
       scrollport's edge, so a marker sitting flush on that end reads as below
       the fold at the bottom of the scroll and the cue never retires. Overlap
       absorbs that, and the matching negative margin keeps the marker from
       lengthening the content it is measuring. */
    --sentinel-overlap: 2px;

    height: var(--sentinel-overlap);
    margin-top: calc(-1 * var(--sentinel-overlap));
  }

  .scroll-cue {
    /* Deep enough that the cut-off row or line under it is thinned rather than
       hidden — this is a hint that there is more, not a curtain over it. */
    --cue-height: var(--scroll-cue-height, 72px);
    /* The ramp reaches full strength in the bottom fifth, so a caption band or a
       line of body text under the fade stays readable while still visibly
       dimming toward the edge. */
    --cue-opaque-from: 80%;

    position: sticky;
    /* The scrollport clips at its padding box but seats its children in its
       content box, and a sticky inset resolves against the latter — so
       `bottom: 0` lands one bottom-padding short of the edge and leaves the
       content still showing through that strip undimmed, under a hard line where
       the ramp turns opaque. `coverScrollportPadding` measures the strip; the
       0px fallback only ever applies before the cue has armed. */
    bottom: calc(-1 * var(--scrollport-bottom-padding, 0px));
    height: var(--cue-height);
    /* Pulled back over the content it dims: the cue travels with the scrollport
       and must not add a strip of its own to the scroll range. */
    margin-top: calc(-1 * var(--cue-height));
    pointer-events: none;
    transition: opacity var(--duration-base) var(--ease-glide);
    /* rgba fallback precedes the color-mix (docs/COMPATIBILITY.md); painting
       from --surface rather than white gives dark mode a dark fade. The clear
       end is a zero-alpha surface, not the `transparent` keyword, which some
       engines interpolate through gray. */
    background: linear-gradient(
      to bottom,
      rgba(255, 255, 255, 0),
      rgba(255, 255, 255, 1) var(--cue-opaque-from)
    );
    background: linear-gradient(
      to bottom,
      color-mix(in srgb, var(--surface) 0%, transparent),
      var(--surface) var(--cue-opaque-from)
    );
  }

  .scroll-cue-frame {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .scroll-cue.overlay {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    margin-top: 0;
  }

  .scroll-cue.retired {
    opacity: 0;
  }
</style>
