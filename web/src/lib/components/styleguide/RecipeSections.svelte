<script lang="ts">
  import Button from '$lib/components/design/Button.svelte';

  // Composed specimens — the styleguide's bridge from single tokens to real
  // surfaces. Every rule in these specimens is a token reference; each recipe
  // names what it reaches for so a contributor can copy the composition, not
  // the values.
</script>

<section>
  <h3>Recipes</h3>
  <p>
    The defaults, composed — how a handful of tokens assemble into the surfaces the app builds.
    Start from one of these before inventing a new arrangement; if a recipe and a rule disagree, the
    token's usage rule wins.
  </p>

  <div class="recipe-grid">
    <figure class="recipe">
      <figcaption>
        <h4>Card</h4>
        <p class="recipe-tokens">
          <code>--surface</code> · <code>--border</code> hairline · <code>--radius-lg</code> ·
          <code>--space-4</code> padding · <code>--text-strong</code> heading over
          <code>--text</code> body and <code>--text-soft</code> meta
        </p>
      </figcaption>
      <div class="specimen card">
        <h5>Coloring Book</h5>
        <p>Line-art pages for the crayons to color in — open one up and let them scribble.</p>
        <span class="card-meta">Two books · updated with each release</span>
      </div>
    </figure>

    <figure class="recipe">
      <figcaption>
        <h4>Form row</h4>
        <p class="recipe-tokens">
          <code>--font-size-sm</code> <code>--font-weight-medium</code> label ·
          <code>--input-font-size</code> input on <code>--surface</code> with a
          <code>--border</code> hairline at <code>--radius-sm</code> ·
          <code>--font-size-xs</code> <code>--text-soft</code> help
        </p>
      </figcaption>
      <div class="specimen form-row">
        <label for="recipe-input">Access code</label>
        <input
          id="recipe-input"
          type="text"
          placeholder="splotch-1234"
          aria-describedby="recipe-input-help"
        />
        <span class="form-help" id="recipe-input-help"
          >Saved on this device — forget it any time.</span
        >
      </div>
    </figure>

    <figure class="recipe">
      <figcaption>
        <h4>Callout</h4>
        <p class="recipe-tokens">
          <code>--brand-wash</code> fill · <code>--radius-lg</code> · <code>--space-4</code> padding
          · <code>--text-strong</code> lead, <code>--text</code> body. For a form's submit result,
          use the <code>StatusMessage</code> primitive instead
        </p>
      </figcaption>
      <div class="specimen callout">
        <h5>Not sure? Start here</h5>
        <p>
          A brand-tinted aside that guides without shouting — the wash flips with the theme and the
          ink stays readable on it.
        </p>
      </div>
    </figure>

    <figure class="recipe">
      <figcaption>
        <h4>CTA block</h4>
        <p class="recipe-tokens">
          A card composed with the <code>Button</code> primitive's <code>brand</code> variant —
          <code>--font-size-lg</code> lede · <code>--space-3</code> between body and action
        </p>
      </figcaption>
      <div class="specimen card cta">
        <h5 class="cta-lede">Ready when they are</h5>
        <p>Open it up, hand over the device, and let them make a mess. That's the whole idea.</p>
        <Button variant="brand">Start drawing</Button>
      </div>
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
    font-size: var(--font-size-sm);
  }

  h3 {
    color: var(--text-strong);
    font-size: var(--font-size-lg);
    margin-bottom: var(--space-2);
  }

  code {
    font-size: var(--font-size-xs);
    color: var(--brand-text);
  }

  .recipe-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--space-6);
  }

  .recipe {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  h4 {
    margin: 0;
    color: var(--text-strong);
    font-size: var(--font-size-md);
  }

  .recipe-tokens {
    max-width: 60ch;
    margin: var(--space-1) 0 0;
    font-size: var(--font-size-sm);
    color: var(--text-soft);
    line-height: 1.6;
  }

  /* The specimens grow to a shared row height so the grid reads as a set. */
  .specimen {
    flex: 1;
  }

  .card {
    background: var(--surface);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
  }

  h5 {
    margin: 0 0 var(--space-2);
    color: var(--text-strong);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-bold);
  }

  .specimen p {
    margin: 0;
    color: var(--text);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  .card-meta {
    display: block;
    margin-top: var(--space-2);
    color: var(--text-soft);
    font-size: var(--font-size-xs);
  }

  .form-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    background: var(--surface-2);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
  }

  .form-row label {
    color: var(--text);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }

  .form-row input {
    background: var(--surface);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-3);
    color: var(--text-strong);
    font-family: inherit;
    font-size: var(--input-font-size);
  }

  .form-row input:focus-visible {
    border-color: var(--brand);
    outline: 2px solid var(--brand-text);
    outline-offset: 2px;
  }

  .form-help {
    color: var(--text-soft);
    font-size: var(--font-size-xs);
  }

  .callout {
    background: var(--brand-wash);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
  }

  .cta {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .cta h5,
  .cta p {
    margin: 0;
  }

  .cta-lede {
    font-size: var(--font-size-lg);
  }
</style>
