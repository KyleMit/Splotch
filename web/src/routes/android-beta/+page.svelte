<script lang="ts">
  import { BETA_OPT_IN_URL } from '$lib/androidBeta';
  import CrayonStrip from '$lib/components/CrayonStrip.svelte';
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
      <span class="wordmark">Splotch for Android</span>
    </div>

    <div class="band header">
      <CrayonStrip />
      <p class="eyebrow">Closed testing · Google Play</p>
      <h1>Join the Android beta</h1>
      <p class="lede">
        Joining is free and takes three quick steps. Thank you for helping — trying Splotch on a
        real phone or tablet finds problems we can't catch on our own.
      </p>
    </div>

    <StepLedger />

    <div class="band trouble">
      <Disclosure class="beta-disclosure">
        {#snippet summary()}Troubleshooting{/snippet}

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
     Theme-invariant tokens (--radius-*, --duration-*, --font-family) are still
     referenced directly.

     The drawing route's app-surface locks (app.css) don't reach this route, so
     the page scrolls, selects, and zooms as a normal document with no opt-out. */
  .beta {
    --beta-ground: #f1efeb; /* = --paper-margin, light */
    --beta-sheet: #fcfbf8; /* = --paper, light */
    --beta-sheet-border: #ddd6cc; /* = --border-warm, light */
    /* Hairlines: between --border-warm and --paper-margin. The top bar's is a
       shade lighter than the in-content rules so it reads as chrome, not a
       section break. */
    --beta-rule: #e7e1d6;
    --beta-rule-soft: #ece7dd;
    --beta-tint: #f6f2ec; /* ~ --surface-warm-hover (#f4f0ea), light */
    --beta-ink: #2b2b33; /* ~ --text-strong (#333), light */
    --beta-body: #55525c; /* ~ --text (#555), light */
    --beta-body-strong: #4d4a53; /* between --text-strong and --text */
    --beta-muted: #6c6c76; /* ~ --text-mid (#666), light */
    --beta-label: #666; /* = --text-mid, light */
    --beta-eyebrow: #7c50bb; /* = --brand-text, light */
    /* Darker than --brand, whose 3.4:1 fails WCAG AA for body-size text; this
       clears 4.5:1 as a link and as a white-on-purple button fill. Same value
       /privacy pins for the same reason. */
    --beta-link: #7c4dcf;
    --beta-link-hover: #6b3fa0;
    /* Step numerals. The handoff specced a lighter tint (#c4a7ea), which is
       2.0:1 on the sheet and fails even the 3:1 large-text threshold, so the
       numerals take --brand instead — the lightest purple that clears it at
       this size. --brand is one of the few themed-file tokens safe on this
       light-only page: tokens.css defines it once and never redefines it in a
       dark block, the same exemption /privacy documents for its h1. */
    --beta-numeral: var(--brand);
    --beta-on-accent: #fff;
    /* Inside the sheet every band lines up on one horizontal padding. */
    --beta-gutter: clamp(24px, 5vw, 52px);

    /* body's background is the themed --app-bg, so the ground has to reach the
       bottom of the viewport or a dark-mode strip shows beneath short content. */
    min-height: 100vh;
    background: var(--beta-ground);
    padding: 32px 16px 72px;
    color: var(--beta-ink);
    line-height: 1.62;
    font-size: 16px;
    text-wrap: pretty;
  }

  .sheet {
    max-width: 720px;
    margin: 0 auto;
    background: var(--beta-sheet);
    border: 1px solid var(--beta-sheet-border);
    border-radius: var(--radius-xl);
    box-shadow:
      0 1px 2px rgba(93, 84, 68, 0.05),
      0 10px 30px rgba(93, 84, 68, 0.07);
    overflow: hidden;
  }

  /* Narrower than the sheet's own 720px and the card has no room to read as a
     card — the frame collapses to a hairline of ground either side, which looks
     like a rendering fault rather than a decision. Below that, the page goes
     wall to wall and the tinted bands become the only structure, running
     full-bleed. Threshold is the sheet width plus the ground padding it needs
     on both sides to be visible at all. */
  @media (max-width: 760px) {
    .beta {
      padding: 0;
      /* The sheet now covers the ground everywhere, so anything that peeks
         through (overscroll, a short viewport) has to match it. */
      background: var(--beta-sheet);
    }

    .sheet {
      max-width: none;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }
  }

  .band {
    padding-left: var(--beta-gutter);
    padding-right: var(--beta-gutter);
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 22px var(--beta-gutter);
    border-bottom: 1px solid var(--beta-rule-soft);
  }

  .back {
    color: var(--beta-link);
    text-decoration: none;
    font-weight: 600;
    font-size: 14.5px;
  }

  .wordmark {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: var(--beta-label);
  }

  .header {
    padding-top: 44px;
    padding-bottom: 8px;
  }

  .header :global(.crayons) {
    margin-bottom: 18px;
  }

  .eyebrow {
    margin: 0 0 14px;
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--beta-eyebrow);
  }

  h1 {
    margin: 0 0 18px;
    font-size: clamp(30px, 5.2vw, 42px);
    line-height: 1.12;
    letter-spacing: -0.015em;
    font-weight: 700;
    color: var(--beta-ink);
    max-width: 15ch;
  }

  .lede {
    margin: 0;
    font-size: 17.5px;
    line-height: 1.6;
    color: var(--beta-body);
    max-width: 56ch;
  }

  .trouble {
    padding-top: 36px;
    padding-bottom: 40px;
  }

  /* The Disclosure primitive owns only the shell, the hidden native marker and
     the chevron; its two themed values (--border, --text-faint) are overridden
     here so the panel stays on this page's light-only palette. */
  .trouble :global(.beta-disclosure) {
    border-color: var(--beta-rule);
    border-radius: var(--radius-md);
    background: var(--beta-tint);
  }

  .trouble :global(.beta-disclosure > summary) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
    font-size: 16px;
    font-weight: 700;
    color: var(--beta-ink);
  }

  .trouble :global(.beta-disclosure > summary::after) {
    color: var(--beta-muted);
    font-size: 22px;
    line-height: 1;
  }

  .rows {
    padding: 0 18px 6px;
  }

  .row {
    border-top: 1px solid var(--beta-rule);
    margin-top: 20px;
    padding-top: 20px;
  }

  .row:first-of-type {
    margin-top: 16px;
  }

  .row h3 {
    margin: 0 0 4px;
    font-size: 16px;
    font-weight: 700;
    color: var(--beta-ink);
  }

  .row p {
    margin: 0;
    font-size: 15.5px;
    color: var(--beta-body);
    max-width: 62ch;
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

    a:not(.back):hover {
      color: var(--beta-link-hover);
    }
  }
</style>
