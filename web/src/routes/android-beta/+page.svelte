<script lang="ts">
  import { BETA_OPT_IN_URL, TESTERS_GROUP_URL } from '$lib/components/androidBeta/androidBeta';
  import Icon from '$lib/components/Icon.svelte';
  import Disclosure from '$lib/components/design/Disclosure.svelte';
  import ScrollCue from '$lib/components/design/ScrollCue.svelte';
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

<PageShell title="Join the Android beta" wordmark="Splotch for Android">
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
            Close and reopen the Play Store, check the active account, and try the store link again.
            As a last resort, open Android Settings → Apps → Google Play Store → Storage and clear
            its cache; the exact menu names vary by device.
          </p>
        </div>
        <div class="row">
          <h3>Leaving the beta</h3>
          <p>
            Open <a href={BETA_OPT_IN_URL} target="_blank" rel="noopener noreferrer"
              >the tester page</a
            > again and press “Leave the program”, which stops the beta updates. If a public Android version
            is out by then, you may need to uninstall Splotch and reinstall it from Google Play to switch
            over; until there is one, leaving the beta also means you won't be able to reinstall the Android
            app. No hard feelings.
          </p>
        </div>
      </div>
    </Disclosure>
  </div>

  <!-- Last thing in the sheet, so its sentinel marks the end of the page's own
       content: the document is the scroller here, and the cue fades the sheet
       into itself at the foot of the viewport for as long as there are steps
       still below. Nothing about the page's height is ours to set, so the
       trailing-row cut the picker uses has no counterpart on this surface. -->
  <ScrollCue />
</PageShell>

<style>
  /* Everything colored here reads PageShell's --page-* palette or a themed app
     token, so the sign-up page follows the parent's night-mode preference like
     every other page. Theme-invariant tokens (--duration-*, --radius-*) are
     used directly. */

  .trouble {
    margin-top: 48px;
  }

  /* The Disclosure primitive owns the shell, the hidden native marker and its
     own '›' pseudo-element; that last one is replaced here by the repo's
     chevron icon, which rotates rather than swapping glyphs — Icon renders via
     {@html}, which hydration does not reconcile (.claude/rules/svelte.md). */
  .trouble :global(.beta-disclosure) {
    border: var(--border-width) solid var(--page-rule);
    border-radius: var(--radius-lg);
    background: var(--surface-2);
    transition: background var(--duration-base) ease;
  }

  .trouble :global(.beta-disclosure > summary) {
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
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: var(--page-ink);
  }

  .trouble-sub {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    line-height: 1.45;
    color: var(--page-muted);
  }

  /* The disc is the tappable affordance: the sheet's own tone ringed by a
     hairline, so it reads as a target rather than a glyph floating on the
     panel — lighter than the panel on the white paper, darker on the dark one. */
  .chev-disc {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 32px;
    height: 32px;
    border: var(--border-width) solid var(--page-rule);
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
     --page-muted clears the floor on the disc and on the panel behind it in
     both themes — android-beta.spec.ts measures it on each. */
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
    border-top: var(--border-width) solid var(--page-rule);
    margin-top: 20px;
    padding-top: 20px;
  }

  .row h3 {
    margin: 0 0 4px;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-bold);
    color: var(--page-ink);
  }

  .row p {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    line-height: 1.6;
    color: var(--page-body);
  }

  a {
    color: var(--page-link);
    text-underline-offset: 3px;
    text-decoration-thickness: 1px;
  }

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it stuck until the next tap elsewhere. The panel's fill carries its
     hover, and a link's underline thickens — the themed ramps have no deeper
     step for either. */
  @media (hover: hover) {
    .trouble :global(.beta-disclosure:hover) {
      background: var(--surface-hover);
    }

    a:hover {
      text-decoration-thickness: 2px;
    }
  }

  /* The subtitle is the first thing to wrap to three lines beside the chevron
     disc, so the narrowest phones get the short form of the same sentence. */
  @media (max-width: 480px) {
    .trouble-sub-clause {
      display: none;
    }
  }
</style>
