<script lang="ts">
  import { BETA_OPT_IN_URL, TESTERS_GROUP_URL } from '$lib/components/androidBeta/androidBeta';
  import { TESTFLIGHT_APP_URL, TESTFLIGHT_INVITE_URL } from '$lib/components/iosBeta/iosBeta';
  import Icon from '$lib/components/Icon.svelte';
  import Disclosure from '$lib/components/design/Disclosure.svelte';
  import ScrollCue from '$lib/components/design/ScrollCue.svelte';
  import PageShell from '$lib/components/page/PageShell.svelte';
  import RuleLabel from '$lib/components/page/RuleLabel.svelte';
  import BetaStepLedger from './BetaStepLedger.svelte';

  interface Props {
    platform: 'android' | 'ios';
  }

  let { platform }: Props = $props();
</script>

<PageShell
  title={platform === 'android' ? 'Join the Android beta' : 'Join the iPhone and iPad beta'}
  wordmark={platform === 'android' ? 'Splotch for Android' : 'Splotch for iOS'}
>
  {#snippet lede()}
    {#if platform === 'android'}
      Joining is free and takes three quick steps — plus an optional fourth if you'd like to send
      feedback. Thank you for helping: trying Splotch on a real phone or tablet finds problems we
      can't catch on our own.
    {:else}
      Joining is free and takes three quick steps — plus an optional fourth if you'd like to send
      feedback. Thank you for helping: trying Splotch on a real iPhone or iPad finds problems we
      can't catch on our own.
    {/if}
  {/snippet}

  <RuleLabel>How to join</RuleLabel>

  <BetaStepLedger {platform} />

  <div class="trouble">
    <Disclosure class="beta-disclosure">
      {#snippet summary()}
        <span class="trouble-heading">
          <h2 class="trouble-label">Troubleshooting</h2>
          {#if platform === 'android'}
            <span class="trouble-sub">
              Beta not showing up, <span class="trouble-sub-clause">“item not found”,&nbsp;</span>or
              stuck on step 2?
            </span>
          {:else}
            <span class="trouble-sub">
              Invitation not opening, <span class="trouble-sub-clause">beta unavailable,&nbsp;</span
              >or no Install button?
            </span>
          {/if}
        </span>
        <span class="chev-disc">
          <Icon name="chevron-right" class="chev" aria-hidden="true" />
        </span>
      {/snippet}

      <div class="rows">
        {#if platform === 'android'}
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
        {:else}
          <div class="row">
            <h3>The invitation opens in Safari instead of TestFlight</h3>
            <p>
              Install <a href={TESTFLIGHT_APP_URL} target="_blank" rel="noopener noreferrer"
                >TestFlight from the App Store</a
              > first, then reopen the invitation on the same iPhone or iPad.
            </p>
          </div>
          <div class="row">
            <h3>The beta isn't accepting new testers</h3>
            <p>
              The current build may still be waiting for Apple's review, enrollment may be paused,
              or the group may be full. Try the <a
                href={TESTFLIGHT_INVITE_URL}
                target="_blank"
                rel="noopener noreferrer">invitation</a
              > again later.
            </p>
          </div>
          <div class="row">
            <h3>Splotch appears, but there is no Install button</h3>
            <p>
              Check that the device runs iOS or iPadOS 16.4 or newer and has enough free storage,
              then close and reopen TestFlight.
            </p>
          </div>
          <div class="row">
            <h3>A new beta build isn't showing up</h3>
            <p>
              Open TestFlight, select Splotch, and look for an Update button. TestFlight may take a
              little while to show a newly released build.
            </p>
          </div>
          <div class="row">
            <h3>Leaving the beta</h3>
            <p>
              Open Splotch in TestFlight, scroll to the bottom, and tap “Stop Testing”. This stops
              beta updates and removes you from the testing group. No hard feelings.
            </p>
          </div>
        {/if}
      </div>
    </Disclosure>
  </div>

  <ScrollCue />
</PageShell>

<style>
  .trouble {
    margin-top: 48px;
  }

  .trouble :global(.beta-disclosure) {
    border: var(--border-width) solid var(--page-rule);
    border-radius: var(--radius-lg);
    background: var(--surface-2);
    transition:
      background var(--duration-base) ease,
      border-color var(--duration-base) ease;
  }

  .trouble :global(.beta-disclosure > summary) {
    gap: 16px;
    padding: 18px 20px;
  }

  .trouble :global(.beta-disclosure > summary::after) {
    content: none;
  }

  .trouble-heading {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

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

  @media (hover: hover) {
    .trouble :global(.beta-disclosure:hover) {
      background: var(--surface-hover);
      border-color: var(--border-warm-strong);
    }

    a:hover {
      text-decoration-thickness: 2px;
    }
  }

  @media (max-width: 480px) {
    .trouble-sub-clause {
      display: none;
    }
  }
</style>
