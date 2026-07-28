<script lang="ts">
  import { BETA_OPT_IN_URL } from '$lib/components/androidBeta/androidBeta';
  import CrayonStrip from '$lib/components/CrayonStrip.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import Disclosure from '$lib/components/design/Disclosure.svelte';
  import StepLedger from '$lib/components/androidBeta/StepLedger.svelte';

  // Sign-up instructions for the Google Play closed test. The steps are
  // sequential rather than a menu — see StepLedger — and everything a reader
  // only needs when something has gone wrong lives in the collapsed
  // Troubleshooting panel below them.
</script>

<svelte:head>
  <title>Join the Android Beta · Splotch</title>
  <meta
    name="description"
    content="How to become an Android beta tester for Splotch: join the testers group, opt in on Google Play, and install the app."
  />
  <!-- Link-only page: keeping it out of search indexes limits how widely the
       support address on it circulates. Deliberately NOT paired with a
       robots.txt Disallow — a blocked crawler never fetches the page, so it
       would never see this tag and could still index the bare URL. -->
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="beta">
  <div class="sheet">
    <div class="topbar">
      <a class="back" href="/">← Back to drawing</a>
      <span class="brand">
        <CrayonStrip />
        <span class="wordmark">Splotch for Android</span>
      </span>
    </div>

    <div class="hero">
      <div class="hero-main">
        <h1>Join the Android beta</h1>
        <p class="lede">
          Joining is free and takes three quick steps. Thank you for helping — trying Splotch on a
          real phone or tablet finds problems we can't catch on our own.
        </p>
      </div>
      <div class="hero-side">
        <p class="eyebrow">Closed testing · Google Play</p>
        <p class="hero-note">
          Three steps, in order — each one unlocks the next. Google Play won't show you the app
          until the first two are done.
        </p>
      </div>
    </div>

    <h2 class="rule-label"><span>How to join</span></h2>

    <StepLedger />

    <div class="trouble">
      <Disclosure class="beta-disclosure">
        {#snippet summary()}
          <span class="trouble-label">Troubleshooting</span>
          <Icon name="chevron-right" class="chev" aria-hidden="true" />
        {/snippet}

        <div class="rows">
          <div class="row">
            <h3>“Item not found” on the store link</h3>
            <p>
              You aren't opted in yet, or the browser is signed in to a different Google account. Go
              back to <a href={BETA_OPT_IN_URL} target="_blank" rel="noopener noreferrer"
                >the tester page</a
              >, check the account shown in the top-right corner, and opt in there first.
            </p>
          </div>
          <div class="row">
            <h3>The tester page says you're not a member</h3>
            <p>
              Your request to join the group hasn't finished, or it went through on another account.
              Check that account's inbox for Google's confirmation — and if an owner has to approve
              you, you'll get a second email once they have.
            </p>
          </div>
          <div class="row">
            <h3>The phone can't find the app but your computer can</h3>
            <p>
              The two are signed in to different accounts. In the Play Store app, tap your profile
              picture in the top-right to see which account is active.
            </p>
          </div>
          <div class="row">
            <h3>Everything looks right and Play still disagrees</h3>
            <p>
              Close and reopen the Play Store, check the active account, and try the store link
              again. As a last resort, open Android Settings → Apps → Google Play Store → Storage
              and clear its cache; the exact menu names vary by device.
            </p>
          </div>
          <div class="row">
            <h3>Leaving the beta</h3>
            <p>
              Open <a href={BETA_OPT_IN_URL} target="_blank" rel="noopener noreferrer"
                >the tester page</a
              > again and press “Leave the program”, which stops the beta updates. If a public Android
              version is out by then, you may need to uninstall Splotch and reinstall it from Google Play
              to switch over; until there is one, leaving the beta also means you won't be able to reinstall
              the Android app. No hard feelings.
            </p>
          </div>
        </div>
      </Disclosure>
    </div>
  </div>
</main>

<style>
  /* Deliberately light-only, like /privacy and /admin: the themed color tokens
     flip with data-theme / prefers-color-scheme (tokens.css sets them on :root,
     which reaches this route too), so adopting them would half-dark-theme a
     page whose link and button contrast is pinned to a light ground. The
     palette is therefore declared once here instead of scattered as literals,
     each value commented with the light-theme token it approximates.
     Theme-invariant tokens (--duration-*, --font-family) are used directly.

     The drawing route's app-surface locks (app.css) don't reach this route, so
     the page scrolls, selects, and zooms as a normal document with no opt-out. */
  .beta {
    --beta-ground: #f0efed; /* ~ --app-bg (#f5f5f5), warmed */
    --beta-sheet: #ffffff; /* = --surface, light */
    --beta-ink: #26262e; /* ~ --text-strong (#333), light */
    --beta-body: #55555f; /* ~ --text (#555), light */
    --beta-note: #4a4a54; /* ~ --text on the warm tint */
    /* The spec's muted ink was #9a98a3 (~ --text-faint). That is 2.8:1 on the
       sheet and fails WCAG AA everywhere it carries text — the wordmark, the
       hero note, fine print, aside labels and bodies. This is the darkest value
       that still reads as recessive and clears 4.5:1. --beta-faint keeps the
       specced tone for the one non-text use, the chevron glyph. */
    --beta-muted: #6c6c76; /* ~ --text-mid (#666), light */
    --beta-faint: #9a98a3; /* ~ --text-faint (#999), light — icon fill only */
    /* Darker than --brand, whose 3.4:1 fails WCAG AA for body-size text; this
       clears 4.5:1 as a link and as a white-on-purple button fill. Same value
       /privacy pins for the same reason. */
    --beta-link: #7c4dcf;
    --beta-link-hover: #6b3fbf;
    --beta-pill: #f2ecfb; /* ~ --brand-wash (#ede7f6), light */
    --beta-eyebrow: #7c50bb; /* = --brand-text, light */
    --beta-warm: #f7f3ee; /* ~ --surface-warm-hover (#f4f0ea), light */
    --beta-rule: #eeeae4; /* ~ --border-warm (#ddd6cc), lightened */
    --beta-note-rule: #e6e1d9;
    --beta-row: #faf8f5;
    --beta-row-hover: #f4f0ea;
    /* Darkened tints of the Red and Green crayons for the two card labels: the
       raw palette hues are ~2.6:1 on the warm tint. Not palette values, so they
       are not palette-source.test.mjs's to own. */
    --beta-warn-ink: #b03f3b;
    --beta-go-ink: #4f7a36;
    --beta-on-accent: #fff;
    /* Inside the sheet every band lines up on one horizontal padding. */
    --beta-gutter: clamp(20px, 5vw, 34px);

    /* body's background is the themed --app-bg, so the ground has to reach the
       bottom of the viewport or a dark-mode strip shows beneath short content. */
    min-height: 100vh;
    background: var(--beta-ground);
    padding: 32px 16px 72px;
    color: var(--beta-ink);
    font-size: 16px;
    line-height: 1.62;
    text-wrap: pretty;
  }

  /* Wide enough that the hero's 250px side column can sit beside a 46px H1
     without squeezing it onto three lines — the handoff specced the columns but
     not the sheet, and this is the width they imply. */
  .sheet {
    max-width: 880px;
    margin: 0 auto;
    padding: 0 var(--beta-gutter) 40px;
    background: var(--beta-sheet);
    border-radius: var(--radius-xl);
    box-shadow:
      0 1px 2px rgba(93, 84, 68, 0.05),
      0 10px 30px rgba(93, 84, 68, 0.07);
  }

  /* Narrower than the sheet itself and the card has no room to read as a card —
     the frame collapses to a hairline of ground either side, which looks like a
     rendering fault rather than a decision. Below that the page goes wall to
     wall. Threshold is the sheet width plus the ground padding it needs on both
     sides to be visible at all. */
  @media (max-width: 920px) {
    .beta {
      padding: 0;
      /* The sheet now covers the ground everywhere, so anything that peeks
         through (overscroll, a short viewport) has to match it. */
      background: var(--beta-sheet);
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
    color: var(--beta-link);
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
    color: var(--beta-muted);
  }

  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 250px;
    gap: 48px;
    align-items: end;
    padding: 8px 0 34px;
  }

  h1 {
    margin: 0;
    font-size: 46px;
    font-weight: 700;
    line-height: 1.06;
    letter-spacing: -0.015em;
    color: var(--beta-ink);
    text-wrap: balance;
  }

  .lede {
    margin: 16px 0 0;
    font-size: 18px;
    font-weight: 500;
    line-height: 1.6;
    color: var(--beta-body);
  }

  .eyebrow {
    display: inline-block;
    margin: 0;
    padding: 7px 12px;
    border-radius: 999px;
    background: var(--beta-pill);
    color: var(--beta-eyebrow);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .hero-side {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .hero-note {
    margin: 12px 0 0;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.55;
    color: var(--beta-muted);
  }

  /* The section label survives only as a rule: a small caps word and a hairline
     that runs out to the edge. */
  .rule-label {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 0;
    padding-bottom: 30px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--beta-muted);
  }

  .rule-label::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--beta-rule);
  }

  .trouble {
    margin-top: 48px;
  }

  /* The Disclosure primitive owns the shell, the hidden native marker and its
     own '›' pseudo-element; that last one is replaced here by the repo's
     chevron icon, which rotates rather than swapping glyphs — Icon renders via
     {@html}, which hydration does not reconcile (.claude/rules/svelte.md). */
  .trouble :global(.beta-disclosure) {
    border: 0;
    border-radius: 14px;
    background: var(--beta-row);
    transition: background var(--duration-base) ease;
  }

  .trouble :global(.beta-disclosure > summary) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 18px 20px;
  }

  .trouble :global(.beta-disclosure > summary::after) {
    content: none;
  }

  .trouble-label {
    font-size: 16px;
    font-weight: 700;
    color: var(--beta-ink);
  }

  .trouble :global(.chev) {
    width: 20px;
    height: 20px;
    transition: transform var(--duration-base) ease;
  }

  .trouble :global(.chev svg) {
    fill: var(--beta-faint);
  }

  .trouble :global(.beta-disclosure[open] .chev) {
    transform: rotate(90deg);
  }

  .rows {
    padding: 0 20px 8px;
  }

  .row {
    border-top: 1px solid var(--beta-rule);
    margin-top: 20px;
    padding-top: 20px;
  }

  .row h3 {
    margin: 0 0 4px;
    font-size: 16px;
    font-weight: 700;
    color: var(--beta-ink);
  }

  .row p {
    margin: 0;
    font-size: 15px;
    font-weight: 500;
    line-height: 1.6;
    color: var(--beta-body);
  }

  a {
    color: var(--beta-link);
    text-underline-offset: 3px;
    text-decoration-thickness: 1px;
  }

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it stuck until the next tap elsewhere. */
  @media (hover: hover) {
    .back:hover {
      text-decoration: underline;
    }

    .trouble :global(.beta-disclosure:hover) {
      background: var(--beta-row-hover);
    }

    a:not(.back):hover {
      color: var(--beta-link-hover);
    }
  }

  @media (max-width: 540px) {
    /* Three items squeeze the bar, and the wordmark is the least load-bearing:
       it drops under the chips rather than out of the page. */
    .brand {
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
      --crayon-width: 10px;
      --crayon-height: 5px;
    }

    .wordmark {
      font-size: 11px;
    }

    /* Eyebrow first, then the H1 it labels, then the lede and the context note. */
    .hero {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
      padding-bottom: 28px;
    }

    .hero-side {
      display: contents;
    }

    .eyebrow {
      order: -1;
      margin-bottom: 14px;
    }

    .hero-note {
      margin-top: 14px;
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
