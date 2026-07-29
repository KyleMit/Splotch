<script lang="ts">
  import { BETA_OPT_IN_URL, TESTERS_GROUP_URL } from '$lib/components/androidBeta/androidBeta';
  import Icon from '$lib/components/Icon.svelte';
  import Disclosure from '$lib/components/design/Disclosure.svelte';
  import PageShell from '$lib/components/page/PageShell.svelte';
  import RuleLabel from '$lib/components/page/RuleLabel.svelte';
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

<div class="beta">
  <PageShell class="beta-palette" title="Join the Android beta" wordmark="Splotch for Android">
    {#snippet lede()}
      Joining is free and takes three quick steps — plus an optional fourth if you'd like to send
      feedback. Thank you for helping: trying Splotch on a real phone or tablet finds problems we
      can't catch on our own.
    {/snippet}

    <RuleLabel>How to join</RuleLabel>

    <StepLedger />

    <div class="trouble">
      <Disclosure class="beta-disclosure">
        {#snippet summary()}
          <span class="trouble-heading">
            <h2 class="trouble-label">Troubleshooting</h2>
            <span class="trouble-sub">
              Beta not showing up, <span class="trouble-sub-clause">“item not found”,&nbsp;</span>or
              stuck on step 2?
            </span>
          </span>
          <span class="chev-disc">
            <Icon name="chevron-right" class="chev" aria-hidden="true" />
          </span>
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
              Joining is instant and there's no approval to wait on, so either the join never went
              through or it went through on a different Google account. Open <a
                href={TESTERS_GROUP_URL}
                target="_blank"
                rel="noopener noreferrer">the group page</a
              > again, check the account in the top-right corner, and join from there.
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
  </PageShell>
</div>

<style>
  /* Deliberately light-only, like /privacy and /admin: the themed color tokens
     flip with data-theme / prefers-color-scheme (tokens.css sets them on :root,
     which reaches this route too), so adopting them would half-dark-theme a
     page whose link and button contrast is pinned to a light ground. PageShell
     defaults its --page-* palette to those themed tokens, so this route pins
     every one of them instead, each value commented with the light-theme token
     it approximates. Theme-invariant tokens (--duration-*, --radius-*) are used
     directly.

     The overrides land on PageShell's own root via the forwarded class, which is
     the only element they can sit on: a custom property declared on .page would
     otherwise win over the same property inherited from an ancestor. */
  .beta :global(.beta-palette) {
    --page-ground: #f0efed; /* ~ --app-bg (#f5f5f5), warmed */
    --page-sheet: #ffffff; /* = --surface, light */
    --page-ink: #26262e; /* ~ --text-strong (#333), light */
    --page-body: #55555f; /* ~ --text (#555), light */
    /* The spec's muted ink was #9a98a3 (~ --text-faint). That is 2.8:1 on the
       sheet and fails WCAG AA everywhere it carries text — the wordmark, the
       hero note, fine print, and callout labels. This is the darkest value that
       still reads as recessive and clears 4.5:1. */
    --page-muted: #6c6c76; /* ~ --text-mid (#666), light */
    --page-rule: #eeeae4; /* ~ --border-warm (#ddd6cc), lightened */
    /* Darker than --brand, whose 3.4:1 fails WCAG AA for body-size text; this
       clears 4.5:1 as a link and as a white-on-purple button fill. Same value
       /privacy pins for the same reason. */
    --page-link: #7c4dcf;
    --page-link-hover: #6b3fbf;
    /* The step buttons' fill. Same pinning reason as the link: --brand-solid's
       dark value would flip under prefers-color-scheme. */
    --page-accent: #7c4dcf;
    --page-accent-hover: #6b3fbf;
    --page-on-accent: #ffffff;
    /* The sheet's lift, pinned for the same reason: --float-shadow's dark value
       is a light keyline that would show as a halo on this white sheet. */
    --page-shadow: 0 1px 2px rgba(93, 84, 68, 0.05), 0 10px 30px rgba(93, 84, 68, 0.07);
  }

  /* Chrome the Troubleshooting panel owns rather than the shell: everything here
     is one collapsed <details> and the rows inside it. */
  .beta {
    --beta-row: #f7f6f5;
    --beta-row-hover: #f2f0ef;
    --beta-row-border: #eeecec;
    --beta-row-border-hover: #e2dfdf;
    --beta-disc-border: #e8e6e6;
  }

  .trouble {
    margin-top: 48px;
  }

  /* The Disclosure primitive owns the shell, the hidden native marker and its
     own '›' pseudo-element; that last one is replaced here by the repo's
     chevron icon, which rotates rather than swapping glyphs — Icon renders via
     {@html}, which hydration does not reconcile (.claude/rules/svelte.md). */
  .trouble :global(.beta-disclosure) {
    border: 1px solid var(--beta-row-border);
    border-radius: 14px;
    background: var(--beta-row);
    transition:
      background var(--duration-base) ease,
      border-color var(--duration-base) ease;
  }

  .trouble :global(.beta-disclosure > summary) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 20px;
  }

  .trouble :global(.beta-disclosure > summary::after) {
    content: none;
  }

  /* A title alone reads as a footer slab. The subtitle names what is inside, so
     the panel offers a reason to open it rather than a label. */
  .trouble-heading {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* A heading, not a span: without it the five <h3> rows inside the panel land
     under "How to join" and nothing marks where the sign-up path ends. */
  .trouble-label {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    color: var(--page-ink);
  }

  .trouble-sub {
    font-size: 14px;
    font-weight: 500;
    line-height: 1.45;
    color: var(--page-muted);
  }

  /* The disc is the tappable affordance: a raised white target rather than a
     glyph floating on the panel. */
  .chev-disc {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 32px;
    height: 32px;
    border: 1px solid var(--beta-disc-border);
    border-radius: 50%;
    background: var(--page-sheet);
  }

  .trouble :global(.chev) {
    width: 18px;
    height: 18px;
    transition: transform var(--duration-base) ease;
  }

  /* The rotation is the only visual signal of the panel's state, so this is a
     non-text contrast case (WCAG 1.4.11, 3:1) rather than a decorative one.
     --page-muted is 5.2:1 on the disc it sits in, and clears the floor against
     the panel behind it too (4.8:1, 4.6:1 hovered). */
  .trouble :global(.chev svg) {
    fill: var(--page-muted);
  }

  .trouble :global(.beta-disclosure[open] .chev) {
    transform: rotate(90deg);
  }

  .rows {
    padding: 0 20px 8px;
  }

  .row {
    border-top: 1px solid var(--page-rule);
    margin-top: 20px;
    padding-top: 20px;
  }

  .row h3 {
    margin: 0 0 4px;
    font-size: 16px;
    font-weight: 700;
    color: var(--page-ink);
  }

  .row p {
    margin: 0;
    font-size: 15px;
    font-weight: 500;
    line-height: 1.6;
    color: var(--page-body);
  }

  a {
    color: var(--page-link);
    text-underline-offset: 3px;
    text-decoration-thickness: 1px;
  }

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it stuck until the next tap elsewhere. */
  @media (hover: hover) {
    .trouble :global(.beta-disclosure:hover) {
      background: var(--beta-row-hover);
      border-color: var(--beta-row-border-hover);
    }

    a:hover {
      color: var(--page-link-hover);
    }
  }

  /* The subtitle is the first thing to wrap to three lines beside the chevron
     disc, so the narrowest phones get the short form of the same sentence. */
  @media (max-width: 480px) {
    .trouble-sub-clause {
      display: none;
    }

    .trouble-sub {
      font-size: 13px;
    }
  }
</style>
