<script lang="ts">
  import { coverScrollportPadding, observeContentEnd } from '$lib/actions/scrollCue';

  // The continuation cue for a scroller: a fade over its bottom strip saying the
  // content carries on below. Render it as the *last child of the scrolling
  // content* — it places its own sentinel there, and the fade sticks to the
  // scrollport's bottom edge from inside that flow, so it costs no layout height
  // and needs no positioned wrapper.
  //
  // It is a function of live scroll state, never decoration: absent while the
  // content fits, absent once the end of it is on screen, present only in
  // between. `observeContentEnd` supplies all three from one intersection.
  //
  // Height is a local custom property rather than a prop so a call site sets it
  // in its own style block, beside the padding the fade has to sit over. The
  // caller declares `--scroll-cue-height` on any ancestor.
  let atEnd = $state(true);
</script>

<div
  class="scroll-cue-sentinel"
  aria-hidden="true"
  use:observeContentEnd={(reached) => (atEnd = reached)}
></div>
<div class="scroll-cue" class:retired={atEnd} aria-hidden="true" use:coverScrollportPadding></div>

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

  .scroll-cue.retired {
    opacity: 0;
  }
</style>
