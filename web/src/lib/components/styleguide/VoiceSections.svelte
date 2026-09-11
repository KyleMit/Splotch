<script lang="ts">
  import Icon from '$lib/components/Icon.svelte';
  import type { CommonIconName } from '$lib/components/iconTypes';
  import SplotchyIcon from '$lib/components/SplotchyIcon.svelte';
  import BrandMark from '$lib/components/page/BrandMark.svelte';
  import '$lib/components/deferredIcons';

  const dottieGroups = [
    {
      label: 'Everyday expressions',
      expressions: [
        { icon: 'dottie-sunny', label: 'Sunny' },
        { icon: 'dottie-kind-eyes', label: 'Kind eyes' },
        { icon: 'dottie-lean', label: 'Little lean' },
        { icon: 'dottie-giggle', label: 'Giggle' },
        { icon: 'dottie-bright', label: 'Bright' },
      ],
    },
    {
      label: 'Error expressions',
      expressions: [
        { icon: 'dottie-stumped', label: 'A little stumped' },
        { icon: 'dottie-hiccup', label: 'Oh, a hiccup' },
        { icon: 'dottie-question', label: 'A small question' },
        { icon: 'dottie-retry', label: 'One more go' },
        { icon: 'dottie-another-idea', label: 'Another idea' },
      ],
    },
  ] as const satisfies ReadonlyArray<{
    label: string;
    expressions: ReadonlyArray<{ icon: CommonIconName; label: string }>;
  }>;
</script>

<section id="voice" data-sg-section>
  <h3>Voice &amp; copy</h3>
  <p>
    Two voices, one maker. Kid-adjacent copy is playful and warm; parent-facing copy (Settings,
    store listings, privacy) is plain and direct. Sentence case everywhere — Title Case only for
    proper feature names (Night Mode, Guided Access). "You" is the parent, "they" is the child, "we"
    makes the maker's promises. No emoji in UI chrome. Feature bullets lead with verbs, and copy is
    honest about why a tradeoff exists.
  </p>
  <div class="voice-cards">
    <div class="voice-card">
      <div class="voice-head">
        <span class="voice-label">Kid-adjacent</span>
        <span class="voice-qualifier"> — playful &amp; warm</span>
      </div>
      <div class="voice-quotes">
        <blockquote class="kid">
          Open it up, hand over the device, and let them make a mess. That's the whole idea.
        </blockquote>
        <blockquote class="kid">
          A blank page and a box of crayons — no ads, no accounts, nothing to buy.
        </blockquote>
      </div>
    </div>
    <div class="voice-card">
      <div class="voice-head">
        <span class="voice-label">Parent-facing</span>
        <span class="voice-qualifier"> — plain &amp; direct</span>
      </div>
      <div class="voice-quotes">
        <blockquote class="parent">
          Your key is stored only on your device. We never keep a copy.
        </blockquote>
        <blockquote class="parent">
          Splotch collects nothing in the background. No ads. No tracking. No analytics.
        </blockquote>
      </div>
    </div>
  </div>
</section>

<section id="mascot" data-sg-section>
  <h3>Mascot &amp; wordmark</h3>
  <p>
    Splotchy — a rainbow-crayoned splotch — is the mascot and the PWA icon. There is no drawn logo:
    parent pages sign themselves with the brand mark below — the crayon strip (seven pills in
    rainbow order, hues looked up from the drawing palette) beside a small-caps wordmark — while
    page titles are plain Quicksand headings.
  </p>
  <div class="brand-marks">
    <figure>
      <SplotchyIcon class="mascot-demo" />
      <figcaption class="value">splotchy.svg</figcaption>
    </figure>
    <figure>
      <BrandMark wordmark="Splotch for Android" />
      <figcaption class="value">
        brand mark · page/BrandMark.svelte, as PageShell wears it
      </figcaption>
    </figure>
  </div>
</section>

<section id="dottie" data-sg-section>
  <h3>Dottie</h3>
  <p>
    Dottie is Splotch's little purple companion: joyful, friendly, and warm. Her soft, uneven
    silhouette stays the same across expressions, with flat color and a few rounded lines giving her
    personality. She keeps her purple body and dark features in both themes.
  </p>
  {#each dottieGroups as group (group.label)}
    <div class="dottie-group">
      <h4>{group.label}</h4>
      <div class="dottie-expressions">
        {#each group.expressions as expression (expression.icon)}
          <figure>
            <Icon name={expression.icon} class="dottie-demo" aria-hidden="true" />
            <figcaption>
              <span class="dottie-label">{expression.label}</span>
              <code class="value">{expression.icon}</code>
            </figcaption>
          </figure>
        {/each}
      </div>
    </div>
  {/each}
</section>

<style>
  section {
    margin-top: 48px;
  }

  section > p {
    max-width: 62ch;
    margin: 0 0 14px;
    font-size: var(--font-size-sm);
    color: var(--text);
  }

  h3 {
    margin: 0 0 6px;
    color: var(--text-strong);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
  }

  /* --text-soft is pinned to hold 4.5:1 at these 12px sizes on the page
     ground (the axe scan in a11y.spec.ts enforces it). */
  .value {
    font-size: var(--font-size-xs);
    color: var(--text-soft);
  }

  /* Self-contained cards, never interleaved columns: each voice reads as one
     object with its own header band. */
  .voice-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
    gap: var(--space-4);
    max-width: 74ch;
  }

  .voice-card {
    background: var(--surface);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .voice-head {
    padding: var(--space-2) 14px;
    background: var(--surface-2);
    border-bottom: var(--border-width) solid var(--border);
  }

  .voice-label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text);
  }

  .voice-qualifier {
    font-size: var(--font-size-xs);
    color: var(--text-soft);
  }

  .voice-quotes {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: var(--space-3) 14px;
  }

  blockquote {
    margin: 0;
    padding: 0 0 0 var(--space-3);
    font-size: var(--font-size-sm);
    line-height: 1.5;
    color: var(--text);
  }

  .kid {
    border-left: 3px solid var(--brand);
  }

  .parent {
    border-left: 3px solid var(--border-warm-strong);
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

  .dottie-group {
    margin-top: var(--space-6);
  }

  .dottie-group h4 {
    margin: 0 0 var(--space-3);
    color: var(--text-strong);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
  }

  .dottie-expressions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 140px), 1fr));
    gap: var(--space-3);
  }

  .dottie-expressions figure {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    margin: 0;
    padding: var(--space-4);
    background: var(--surface);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-lg);
  }

  .dottie-expressions :global(.dottie-demo) {
    width: 96px;
    height: 96px;
  }

  .dottie-expressions figcaption {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    text-align: center;
    overflow-wrap: anywhere;
  }

  .dottie-label {
    color: var(--text-strong);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
  }
</style>
