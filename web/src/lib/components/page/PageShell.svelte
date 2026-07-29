<script lang="ts">
  import type { Snippet } from 'svelte';
  import CrayonStrip from '../CrayonStrip.svelte';

  // The chrome every standalone, link-shareable page wears: a ground, a centered
  // sheet, a masthead (back link + crayon strip + wordmark) and a hero. Shared
  // by /android-beta and /feedback so a URL handed out in a store listing or a
  // README lands somewhere recognisably Splotch either way.
  //
  // The palette is the --page-* custom properties declared in the style block
  // below, defaulting to the themed app tokens; everything nested inside — the
  // page's own body copy, RuleLabel, StepLedger — reads them rather than
  // restating a color. A page that must not follow the theme overrides them on
  // the forwarded `class` (see /android-beta, whose link and button contrast is
  // measured against a light ground).
  interface Props {
    /** The <h1>. Also the only heading the shell owns. */
    title: string;
    /** Small-caps mark beside the crayon strip, e.g. "Splotch for Android". */
    wordmark: string;
    lede?: Snippet;
    children: Snippet;
    backHref?: string;
    backLabel?: string;
    /** Lands on the palette-bearing root, so a page can override --page-*. */
    class?: string;
  }

  let {
    title,
    wordmark,
    lede,
    children,
    backHref = '/',
    backLabel = '← Back to drawing',
    class: className,
  }: Props = $props();
</script>

<main class={['page', className]}>
  <div class="sheet">
    <div class="topbar">
      <a class="back" href={backHref}>{backLabel}</a>
      <span class="brand">
        <CrayonStrip />
        <span class="wordmark">{wordmark}</span>
      </span>
    </div>

    <div class="hero">
      <h1>{title}</h1>
      {#if lede}
        <p class="lede">{@render lede()}</p>
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
    --page-muted: var(--text-mid);
    --page-rule: var(--border);
    /* --brand itself is 3.4:1 on the light sheet and fails WCAG AA for body-size
       text; --brand-text is the ramp's accessible step in both themes. */
    --page-link: var(--brand-text);
    /* A page with a pinned palette points this at a deeper shade of its own link
       color. The themed ramp has no such step, so a page on the defaults should
       signal hover with the underline instead of a color change. */
    --page-link-hover: var(--page-link);
    /* The solid call-to-action fill and the ink it carries — the beta page's
       step buttons and the feedback page's submit are the same shape wearing
       these. --brand itself is not an option: white on it is 3.4:1. */
    --page-accent: var(--brand-solid);
    --page-accent-hover: var(--brand-solid-hover);
    --page-on-accent: var(--on-brand);
    /* The reading measure: 62 characters, so each block resolves it against its
       own font size (the 18px lede runs wider in px than the 16px body). */
    --page-measure: 62ch;
    /* Themed, because the light sheet's warm lift is invisible on a dark ground
       — --float-shadow is the app's paper-card elevation and already carries a
       dark value. A page with a pinned palette pins this too. */
    --page-shadow: var(--float-shadow);
    /* Inside the sheet every band lines up on one horizontal padding. */
    --page-gutter: clamp(20px, 5vw, 34px);

    /* body's background is --app-bg, so a page whose ground differs from it has
       to reach the bottom of the viewport or a strip of the wrong color shows
       beneath short content. */
    min-height: 100vh;
    background: var(--page-ground);
    padding: 32px 16px 72px;
    color: var(--page-ink);
    font-size: 16px;
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
    border-radius: var(--radius-xl);
    box-shadow: var(--page-shadow);
  }

  /* Narrower than the sheet itself and the card has no room to read as a card —
     the frame collapses to a hairline of ground either side, which looks like a
     rendering fault rather than a decision. Below that the page goes wall to
     wall. Threshold is the sheet width plus the ground padding it needs on both
     sides to be visible at all. */
  @media (max-width: 920px) {
    .page {
      padding: 0;
      /* The sheet now covers the ground everywhere, so anything that peeks
         through (overscroll, a short viewport) has to match it. */
      background: var(--page-sheet);
    }

    .sheet {
      max-width: none;
      border-radius: 0;
      box-shadow: none;
    }
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

  .back {
    color: var(--page-link);
    font-size: 15px;
    font-weight: 700;
    text-decoration: none;
  }

  /* Chips plus wordmark read as one mark, so they travel together and the
     wordmark stays quiet enough not to compete with the H1. */
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    --crayon-width: 13px;
    --crayon-height: 6px;
    --crayon-gap: 3px;
  }

  .wordmark {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: var(--page-muted);
  }

  .hero {
    padding: 8px 0 34px;
  }

  h1 {
    margin: 0;
    font-size: 46px;
    font-weight: 700;
    line-height: 1.06;
    letter-spacing: -0.015em;
    color: var(--page-ink);
    text-wrap: balance;
  }

  .lede {
    margin: 16px 0 0;
    max-width: var(--page-measure);
    font-size: 18px;
    font-weight: 500;
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
    /* Chips alone are seven anonymous dots, so the wordmark stays and stacks
       under them instead of competing with the back link for the same line. */
    .brand {
      --crayon-width: 10px;
      --crayon-height: 5px;

      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
    }

    .wordmark {
      font-size: 10px;
      letter-spacing: 0.12em;
    }

    .hero {
      padding-bottom: 28px;
    }

    h1 {
      font-size: 34px;
      line-height: 1.1;
    }

    .lede {
      font-size: 16px;
    }
  }
</style>
