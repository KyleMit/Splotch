<script lang="ts">
  import ScrollCue from '$lib/components/design/ScrollCue.svelte';
  import { primitiveSections } from './primitiveSections';

  // The scroll-cue specimens read as a pair: enough lines to outrun the box at
  // any width the styleguide is read at, and few enough to sit in it whole. The
  // copy narrates the state the reader is looking at, so scrolling the first one
  // to its end is the demonstration.
  const overflowingLines = [
    'The cue is lit: there is more of this list below the fold.',
    'It is a reading of live scroll state, never decoration.',
    'One IntersectionObserver over a sentinel answers all three states.',
    'So there is no scroll listener, and nothing measured per frame.',
    'The fade sticks to the scrollport and costs the content no height.',
    'Grow what is above it and it re-reads itself.',
    'Show a surface that was hidden and it re-arms.',
    'Two lines left.',
    'Last line — and the fade has stood down.',
  ];
  const fittingLines = [
    'Short enough to sit in the box whole.',
    'So the cue never lights: there is nothing below to reach.',
  ];
</script>

<h3 id={primitiveSections.scrollCue.id} data-sg-section>
  Scroll cue <code class="file-path">design/ScrollCue.svelte</code>
</h3>
<p class="sub-intro">
  The fade that says a scroller's content carries on below: absent while content fits, present while
  more remains under the fold, and absent again once the end is on screen.
</p>
<p class="sub-intro">
  When content mounts or appears in stages, pass <code>contentPending</code> to show the fade immediately.
  Clear it once the content is whole to resume the observed fit and scroll-end behavior.
</p>
<p class="sub-intro">
  For a bounded pane, wrap its scroller in <code>ScrollCue</code>. The <code>children</code>
  snippet receives an end-marker snippet to render as the scroller's last child. The fade paints beside
  the scroller as an overlay, covering its content edge while leaving scrollbar gutters clear. Its position
  is independent of content padding.
</p>
<p class="sub-intro">
  For content that scrolls with the document, or an existing scrolling dialog, render
  <code>ScrollCue</code> without children as the last child of the scrolling content. This form
  places its own sentinel and sticky fade there; the scroller declares
  <code>--scrollport-bottom-padding</code>
  beside its bottom padding so the fade reaches the scrollport edge. Both forms observe the sentinel through
  every scrolling ancestor, including this page. A specimen below the page's fold can therefore report
  more content until you bring it into view.
</p>
<p class="sub-intro">
  Depth is the inherited <code>--scroll-cue-height</code>. Set it on an ancestor of the fade; for
  the wrapper form that means above <code>ScrollCue</code>, since the scroller is the fade's
  sibling. These specimens use the default depth.
</p>
<div class="cue-demo">
  <figure class="cue-figure">
    <!-- Focusable because it scrolls: a scroll region holding nothing focusable
         is unreachable by keyboard, which every real call site avoids by holding
         controls and these text specimens cannot. Svelte reads the tabindex as
         one on a non-interactive element — the case jsx-a11y exempts for a
         scrollable region, and the reason the warning is silenced here. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="cue-scroller"
      tabindex="0"
      role="group"
      aria-label="Scroll cue specimen: content that overflows"
    >
      <ul class="cue-lines">
        {#each overflowingLines as line (line)}
          <li>{line}</li>
        {/each}
      </ul>
      <ScrollCue />
    </div>
    <figcaption>
      Live — scroll it. The fade retires on the last line and lights again the moment you leave it.
    </figcaption>
  </figure>
  <figure class="cue-figure">
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="cue-scroller"
      tabindex="0"
      role="group"
      aria-label="Scroll cue specimen: content that fits"
    >
      <ul class="cue-lines">
        {#each fittingLines as line (line)}
          <li>{line}</li>
        {/each}
      </ul>
      <ScrollCue />
    </div>
    <figcaption>
      The same box over content that fits. Same markup, no fade — the third state costs the call
      site nothing.
    </figcaption>
  </figure>
  <figure class="cue-figure">
    <div class="cue-overlay-demo">
      <ScrollCue>
        {#snippet children(end)}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div
            class="cue-scroller cue-overlay-scroller"
            tabindex="0"
            role="group"
            aria-label="Scroll cue specimen: bounded overlay"
          >
            <ul class="cue-lines">
              {#each overflowingLines as line (line)}
                <li>{line}</li>
              {/each}
            </ul>
            {@render end()}
          </div>
        {/snippet}
      </ScrollCue>
    </div>
    <figcaption>
      Bounded pane — the marker scrolls with the lines; the fade stays at the content edge.
    </figcaption>
  </figure>
</div>

<style>
  h3 {
    margin: 22px 0 var(--space-1);
    color: var(--text-strong);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
  }

  code {
    font-size: var(--font-size-xs);
    color: var(--brand-text);
    white-space: nowrap;
  }

  .file-path {
    font-weight: 400;
  }

  .sub-intro {
    max-width: 62ch;
    margin: 0 0 10px;
    font-size: var(--font-size-sm);
    color: var(--text-soft);
  }

  .cue-demo {
    --cue-demo-height: 260px;

    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--space-4);
    max-width: 620px;
  }

  .cue-figure {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
  }

  /* Deep enough that the default 72px cue reads at the share of a scrollport it
     takes in the app, rather than as a curtain over a demo box. Nothing else
     here configures the cue — it reads whichever box it is dropped into. */
  .cue-scroller {
    height: var(--cue-demo-height);
    overflow-y: auto;
    --scrollport-bottom-padding: var(--space-4);
    padding: var(--space-4) var(--space-4) var(--scrollport-bottom-padding);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }

  .cue-overlay-demo {
    display: flex;
    height: var(--cue-demo-height);
    overflow: hidden;
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-lg);
  }

  .cue-overlay-scroller {
    flex: 1;
    min-height: 0;
    height: 100%;
    border: none;
    border-radius: 0;
  }

  .cue-lines {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--font-size-sm);
    color: var(--text);
  }

  .cue-figure figcaption {
    font-size: var(--font-size-xs);
    color: var(--text-soft);
  }
</style>
