<script lang="ts">
  import type { Snippet } from 'svelte';
  import BrandMark from './BrandMark.svelte';

  // The chrome every standalone page wears: a ground, a centered sheet, a
  // masthead (back link + crayon strip + wordmark) and a hero. Shared by
  // /beta, /changelog, /feedback, /privacy, /design, and the admin
  // console so a URL handed out in a store listing or a README lands somewhere
  // recognisably Splotch either way.
  //
  // The palette is the --page-* custom properties declared in the style block
  // below, resolved from the themed app tokens; everything nested inside — the
  // page's own body copy, RuleLabel, BetaStepLedger — reads them rather than
  // restating a color. Every page wearing this shell follows the parent's
  // night-mode preference: no route pins the palette to one theme.
  interface Props {
    /** The <h1>. Also the only heading the shell owns. */
    title: string;
    /** Small-caps mark beside the crayon strip, e.g. "Splotch for Android". */
    wordmark: string;
    lede?: Snippet;
    /** A control the hero carries beside the title (the admin console's Sign out). */
    actions?: Snippet;
    children: Snippet;
  }

  let { title, wordmark, lede, actions, children }: Props = $props();
</script>

<main class="page">
  <div class="sheet">
    <div class="topbar">
      <a class="back" href="/">← Back to drawing</a>
      <!-- The mark is the masthead's second way home; the strip is decorative
           (aria-hidden), so the wordmark is the link's whole accessible name. -->
      <a class="brand" href="/">
        <BrandMark {wordmark} />
      </a>
    </div>

    <div class="hero">
      <div class="hero-text">
        <h1>{title}</h1>
        {#if lede}
          <p class="lede">{@render lede()}</p>
        {/if}
      </div>
      {#if actions}
        <div class="hero-actions">{@render actions()}</div>
      {/if}
    </div>

    {@render children()}
  </div>
</main>

<style>
  /* The drawing route's app-surface locks (app.css) don't reach these routes, so
     the page scrolls, selects, and zooms as a normal document with no opt-out. */
  .page {
    --page-ground: var(--app-bg);
    --page-sheet: var(--surface);
    --page-ink: var(--text-strong);
    --page-body: var(--text);
    --page-muted: var(--text-soft);
    --page-rule: var(--border);
    /* --brand itself is 3.4:1 on the light sheet and fails WCAG AA for body-size
       text; --brand-text is the ramp's accessible step in both themes. The ramp
       has no deeper step, so a link signals hover with its underline (weight or
       presence) rather than a color change — see /feedback. */
    --page-link: var(--brand-text);
    /* The solid call-to-action fill and the ink it carries — the beta page's
       step buttons and the feedback page's submit are the same shape wearing
       these. --brand itself is not an option: white on it is 3.4:1. */
    --page-accent: var(--brand-solid);
    --page-accent-hover: var(--brand-solid-hover);
    --page-on-accent: var(--on-brand);
    /* The reading measure: 62 characters, so each block resolves it against its
       own font size (the 18px lede runs wider in px than the 16px body). */
    --page-measure: 62ch;
    /* The app's one paper-card elevation: the light sheet's warm lift is
       invisible on a dark ground, so the dark value trades it for a hairline. */
    --page-shadow: var(--float-shadow);
    /* Inside the sheet every band lines up on one horizontal padding. */
    --page-gutter: clamp(20px, 5vw, 34px);

    /* body's background is --app-bg, so a page whose ground differs from it has
       to reach the bottom of the viewport or a strip of the wrong color shows
       beneath short content. */
    min-height: 100vh;
    background: var(--page-ground);
    --page-pad-top: 32px;
    padding: 32px 16px 72px;
    color: var(--page-ink);
    font-size: var(--font-size-md);
    line-height: 1.62;
    text-wrap: pretty;
  }

  /* Wide enough that a hero's side column can sit beside a 46px H1 without
     squeezing it onto three lines. */
  .sheet {
    max-width: 880px;
    margin: 0 auto;
    padding: 0 var(--page-gutter) 40px;
    background: var(--page-sheet);
    border-radius: var(--radius-lg);
    box-shadow: var(--page-shadow);
  }

  /* Tablet: the sheet stops being a fixed 880 and fills the ground instead,
     keeping its frame — a card with an even band of ground either side still
     reads as a card, and it is what stops a capped content column from sitting
     left-aligned in a much wider sheet. */
  @media (max-width: 920px) {
    .page {
      --page-pad-top: var(--space-6);
      padding: var(--space-6);
    }

    .sheet {
      max-width: none;
      /* The topbar brings its own 18px, so this lands the mark 30px down. */
      padding: 12px 32px 36px;
    }
  }

  /* Phone: no room for a frame at all, so the sheet goes wall to wall and takes
     over the ground — anything that peeks through (overscroll, a short
     viewport) has to match it. */
  @media (max-width: 540px) {
    .page {
      --page-pad-top: 0px;
      padding: 0;
      background: var(--page-sheet);
    }

    .sheet {
      padding: 0 var(--page-gutter) 40px;
      border-radius: 0;
      box-shadow: none;
    }
  }

  /* Declared after every breakpoint above so it wins whichever `padding`
     shorthand they set. `viewport-fit=cover` (ADR-0026) plus iOS's
     `contentInset: "never"` render these routes under the status bar and notch,
     and unlike the drawing route nothing here re-insets them — without this the
     back link and wordmark sit under the cutout on a notched iPhone. The ground
     still paints the full strip; only the content moves down. */
  .page {
    padding-top: calc(var(--page-pad-top) + env(safe-area-inset-top));
  }

  /* One bar, then one hero: nothing sits between them, and the bar carries no
     rule of its own so the H1 owns the top of the page. */
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 0;
  }

  /* Never wraps: the mark beside it shrinks first (its type and chips step down
     on a phone), because a two-line back link reads as a layout fault. */
  .back {
    flex-shrink: 0;
    white-space: nowrap;
    color: var(--page-link);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    text-decoration: none;
  }

  /* Chips plus wordmark read as one mark, so they travel together and the
     wordmark stays quiet enough not to compete with the H1. */
  .brand {
    display: inline-flex;
    text-decoration: none;
  }

  .hero {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    flex-wrap: wrap;
    padding: 8px 0 34px;
  }

  .hero-text {
    flex: 1 1 auto;
  }

  /* Rides level with the H1's cap height rather than the hero's top edge, so a
     compact control doesn't float above the title it belongs to. */
  .hero-actions {
    flex-shrink: 0;
    padding-top: 6px;
  }

  h1 {
    margin: 0;
    font-size: var(--font-size-display);
    font-weight: var(--font-weight-bold);
    line-height: 1.08;
    letter-spacing: -0.015em;
    color: var(--page-ink);
    text-wrap: balance;
  }

  .lede {
    margin: 16px 0 0;
    max-width: var(--page-measure);
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-medium);
    line-height: 1.6;
    color: var(--page-body);
  }

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it stuck until the next tap elsewhere. */
  @media (hover: hover) {
    .back:hover {
      text-decoration: underline;
    }
  }

  @media (max-width: 540px) {
    .hero {
      padding-bottom: 28px;
    }

    .lede {
      font-size: var(--font-size-md);
    }
  }
</style>
