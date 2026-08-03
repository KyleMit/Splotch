<script lang="ts">
  import CrayonStrip from '$lib/components/CrayonStrip.svelte';
  import SplotchyIcon from '$lib/components/SplotchyIcon.svelte';
</script>

<section>
  <h3>Voice &amp; copy</h3>
  <p>
    Two voices, one maker. Kid-adjacent copy is playful and warm; parent-facing copy (Settings,
    store listings, privacy) is plain and direct. Sentence case everywhere — Title Case only for
    proper feature names (Night Mode, Guided Access). "You" is the parent, "they" is the child, "we"
    makes the maker's promises. No emoji in UI chrome. Feature bullets lead with verbs, and copy is
    honest about why a tradeoff exists.
  </p>
  <div class="voice-cols">
    <div class="voice-col">
      <h4>Kid-adjacent · playful</h4>
      <blockquote class="voice-quote">
        Open it up, hand over the device, and let them make a mess. That's the whole idea.
      </blockquote>
      <blockquote class="voice-quote">
        A blank page and a box of crayons — no ads, no accounts, nothing to buy.
      </blockquote>
    </div>
    <div class="voice-col">
      <h4>Parent-facing · plain</h4>
      <blockquote class="voice-quote">
        Your key is stored only on your device. We never keep a copy.
      </blockquote>
      <blockquote class="voice-quote">
        Splotch collects nothing. No ads. No tracking. No analytics.
      </blockquote>
    </div>
  </div>
</section>

<section>
  <h3>Mascot &amp; wordmark</h3>
  <p>
    Splotchy — a rainbow-crayoned splotch — is the mascot and the PWA icon. The wordmark is plain
    Quicksand with no drawn logo; the crayon strip (seven pill chips in rainbow order, hues looked
    up from the drawing palette) is its companion mark on parent pages.
  </p>
  <div class="brand-marks">
    <figure>
      <SplotchyIcon class="mascot-demo" />
      <figcaption class="value">splotchy.svg</figcaption>
    </figure>
    <figure>
      <span class="wordmark">Splotch</span>
      <figcaption class="value">wordmark · Quicksand 700</figcaption>
    </figure>
    <figure>
      <span class="strip-lockup">
        <CrayonStrip />
        <span class="strip-label">Splotch for Android</span>
      </span>
      <figcaption class="value">crayon strip · rainbow order</figcaption>
    </figure>
  </div>
</section>

<style>
  section {
    margin-top: var(--space-8);
  }

  section > p {
    max-width: 60ch;
    margin: var(--space-2) 0 var(--space-3);
    font-size: var(--font-size-md);
  }

  h3 {
    color: var(--text-strong);
    font-size: var(--font-size-xl);
    margin-bottom: var(--space-2);
  }

  h4 {
    color: var(--text-strong);
    font-size: var(--font-size-md);
    margin: var(--space-4) 0 var(--space-2);
  }

  /* --text-mid, not --text-muted: these 12px labels must hold 4.5:1 on the
     page ground (the axe scan in a11y.spec.ts enforces it). */
  .value {
    font-size: var(--font-size-xs);
    color: var(--text-mid);
  }

  .voice-cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: var(--space-4);
    max-width: 70ch;
  }

  .voice-col h4 {
    margin-top: 0;
  }

  .voice-quote {
    margin: 0 0 var(--space-2);
    padding: var(--space-3);
    background: var(--surface-2);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  .brand-marks {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-7);
  }

  .brand-marks figure {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
  }

  .brand-marks :global(.mascot-demo) {
    width: 96px;
    height: 96px;
  }

  .wordmark {
    /* PageShell H1 specimen — deliberately above the type ramp (46px/700/-0.015em). */
    font-size: 46px;
    font-weight: 700;
    letter-spacing: -0.015em;
    color: var(--brand-solid);
  }

  .strip-lockup {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }

  .strip-label {
    font-size: var(--font-size-xs);
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text);
  }
</style>
