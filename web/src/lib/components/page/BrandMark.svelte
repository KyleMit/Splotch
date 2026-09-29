<script lang="ts">
  import CrayonStrip from '../CrayonStrip.svelte';

  // The brand lockup — crayon strip beside a small-caps wordmark — extracted
  // from PageShell's masthead so the /design styleguide renders the real mark
  // instead of a mirrored copy. The strip is decorative (CrayonStrip is
  // aria-hidden), so the wordmark text is the lockup's whole accessible content.
  interface Props {
    /** The word after "Splotch" in the mark, e.g. "beta" for "Splotch beta". */
    suffix?: string;
  }

  let { suffix }: Props = $props();
</script>

<span class="brand-mark">
  <CrayonStrip />
  <span class={['wordmark', { suffixed: suffix }]}
    ><span class="name">Splotch</span>{suffix ? ` ${suffix}` : ''}</span
  >
</span>

<style>
  .brand-mark {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    --crayon-width: 11px;
    --crayon-height: 7px;
    --crayon-gap: 4px;
  }

  .wordmark {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    /* Inside PageShell the page palette wins; anywhere else, the themed ink. */
    color: var(--page-body, var(--text));
  }

  /* Small enough to share a topbar row with PageShell's back link rather than
     stacking under it, which cost the topbar a whole row for one word. */
  @media (max-width: 540px) {
    .brand-mark {
      gap: 6px;
      /* Same 60px strip as before, but the height shrinks more than the
         width so the chips keep the desktop mark's bar silhouette; at 7x6
         with a pill radius they were a row of dots. */
      --crayon-width: 9px;
      --crayon-height: 5px;
      --crayon-gap: 3px;
    }

    /* The size stays on the ramp's floor; the tracking tightens instead. */
    .wordmark {
      letter-spacing: 0.06em;
    }

    /* At the floor, a two-word mark wraps beside the back link on common phone
       widths, so a suffixed mark shows only its suffix. The name is clipped
       rather than removed, so the link home keeps its whole accessible name. */
    .suffixed .name {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
    }
  }
</style>
