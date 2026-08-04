<script lang="ts">
  import CrayonStrip from '../CrayonStrip.svelte';

  // The brand lockup — crayon strip beside a small-caps wordmark — extracted
  // from PageShell's masthead so the /design styleguide renders the real mark
  // instead of a mirrored copy. The strip is decorative (CrayonStrip is
  // aria-hidden), so the wordmark text is the lockup's whole accessible content.
  interface Props {
    /** Small-caps mark beside the crayon strip, e.g. "Splotch for Android". */
    wordmark: string;
  }

  let { wordmark }: Props = $props();
</script>

<span class="brand-mark">
  <CrayonStrip />
  <span class="wordmark">{wordmark}</span>
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
      --crayon-width: 7px;
      --crayon-height: 6px;
      --crayon-gap: 2px;
    }

    .wordmark {
      font-size: 10px;
      letter-spacing: 0.08em;
    }
  }
</style>
