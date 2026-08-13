<script lang="ts">
  import { onMount } from 'svelte';
  import BetaEnrollmentPage from '$lib/components/beta/BetaEnrollmentPage.svelte';
  import BetaStep from '$lib/components/beta/BetaStep.svelte';
  import BetaStepLedger from '$lib/components/beta/BetaStepLedger.svelte';
  import {
    MIN_IOS_RELEASE,
    TESTFLIGHT_APP_URL,
    TESTFLIGHT_INVITE_URL,
  } from '$lib/components/iosBeta/iosBeta';
  import { FEEDBACK_URL } from '$lib/siteUrl';
  import { supportEmail } from '$lib/supportEmail';

  let support = $state('');
  onMount(() => {
    support = supportEmail();
  });
</script>

<svelte:head>
  <title>Join the iPhone and iPad Beta · Splotch</title>
  <meta
    name="description"
    content="How to become an iPhone or iPad beta tester for Splotch using Apple's TestFlight app."
  />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#snippet troubleshooting()}
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
      The current build may still be waiting for Apple's review, enrollment may be paused, or the
      group may be full. Try the <a
        href={TESTFLIGHT_INVITE_URL}
        target="_blank"
        rel="noopener noreferrer">invitation</a
      > again later.
    </p>
  </div>
  <div class="row">
    <h3>Splotch appears, but there is no Install button</h3>
    <p>
      Check that the device runs iOS or iPadOS {MIN_IOS_RELEASE} or newer and has enough free storage,
      then close and reopen TestFlight.
    </p>
  </div>
  <div class="row">
    <h3>A new beta build isn't showing up</h3>
    <p>
      Open TestFlight, select Splotch, and look for an Update button. TestFlight may take a little
      while to show a newly released build.
    </p>
  </div>
  <div class="row">
    <h3>Leaving the beta</h3>
    <p>
      Open Splotch in TestFlight, scroll to the bottom, and tap “Stop Testing”. This stops beta
      updates and removes you from the testing group. No hard feelings.
    </p>
  </div>
{/snippet}

<BetaEnrollmentPage
  title="Join the iPhone and iPad beta"
  wordmark="Splotch for iOS"
  intro="Joining is free and takes three quick steps — plus an optional fourth if you'd like to send feedback. Thank you for helping: trying Splotch on a real iPhone or iPad finds problems we can't catch on our own."
  troubleStart="Invitation not opening, "
  troubleClause="beta unavailable,&nbsp;"
  troubleEnd="or no Install button?"
  {troubleshooting}
>
  <BetaStepLedger>
    <BetaStep
      number={1}
      title="Install TestFlight"
      actionHref={TESTFLIGHT_APP_URL}
      actionLabel="Get TestFlight from Apple"
      fine="Already have TestFlight? Skip straight to step 2."
      cardLabel="Use the device you'll draw on"
    >
      {#snippet body()}
        TestFlight is Apple's app for installing prerelease versions of apps. Install it from the
        App Store on the iPhone or iPad where you'd like to try Splotch.
      {/snippet}
      {#snippet cardBody()}
        Opening both links on that iPhone or iPad makes the handoff from Safari to TestFlight much
        simpler.
      {/snippet}
    </BetaStep>

    <BetaStep
      number={2}
      title="Accept the invitation"
      actionHref={TESTFLIGHT_INVITE_URL}
      actionLabel="Open the Splotch invitation"
      fine="The invitation opens in TestFlight once the app is installed."
      cardLabel="If the beta isn't accepting testers"
    >
      {#snippet body()}
        Open Splotch's public invitation and follow Apple's prompt to start testing. TestFlight may
        ask you to sign in with your Apple Account first.
      {/snippet}
      {#snippet cardBody()}
        The current build may still be waiting for Apple's beta review, or enrollment may be paused.
        Try again later or use the feedback link below to let us know.
      {/snippet}
    </BetaStep>

    <BetaStep
      number={3}
      title="Install Splotch"
      actionHref={TESTFLIGHT_INVITE_URL}
      actionLabel="Open Splotch in TestFlight"
      fine={`Requires iOS or iPadOS ${MIN_IOS_RELEASE} or newer.`}
      cardLabel="This is prerelease software"
    >
      {#snippet body()}
        Splotch now appears inside TestFlight. Tap <strong>Install</strong>, then open it like any
        other app. Future beta builds will appear in TestFlight when they're ready.
      {/snippet}
      {#snippet cardBody()}
        A beta can have rough edges. TestFlight builds expire after 90 days, but a newer build will
        normally replace this one well before then.
      {/snippet}
    </BetaStep>

    <BetaStep
      number={4}
      title="Tell us what you think"
      actionHref="/feedback"
      actionLabel="Send feedback"
      fine="No account, nothing to install; your note goes to our private support tracker."
      cardLabel="Or just email me"
      external={false}
      optional
      showCard={!!support}
    >
      {#snippet body()}
        TestFlight can send feedback and screenshots directly. For a longer note, the form lives at
        <a href="/feedback">{FEEDBACK_URL}</a>. Bugs, confusing buttons, and “my toddler did
        <em>what</em>?” stories are all genuinely useful.
      {/snippet}
      {#snippet cardBody()}
        Reach out to me at <a href="mailto:{support}">{support}</a> if something is broken, confusing,
        or unexpectedly delightful. Good and bad are both worth hearing.
      {/snippet}
    </BetaStep>
  </BetaStepLedger>
</BetaEnrollmentPage>
