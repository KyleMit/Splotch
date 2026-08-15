<script lang="ts">
  import { onMount } from 'svelte';
  import RuleLabel from '$lib/components/page/RuleLabel.svelte';
  import { FEEDBACK_URL } from '$lib/siteUrl';
  import { supportEmail } from '$lib/supportEmail';
  import BetaStep from './BetaStep.svelte';
  import BetaStepLedger from './BetaStepLedger.svelte';
  import BetaTroubleshooting from './BetaTroubleshooting.svelte';
  import { MIN_IOS_RELEASE, TESTFLIGHT_APP_URL, TESTFLIGHT_INVITE_URL } from './iosBeta';

  // Step 4 prints the canonical absolute feedback address because testers may
  // read this page on one device and send feedback from another. Its href stays
  // relative so deploy previews still point to their own feedback form.
  // Compose the support address only after hydration so address harvesters
  // cannot find it in prerendered HTML. Without JavaScript the email card stays
  // absent and the server-backed /feedback form remains available.
  let support = $state('');
  onMount(() => {
    support = supportEmail();
  });
</script>

<RuleLabel>How to join on iPhone or iPad</RuleLabel>

<BetaStepLedger>
  <BetaStep
    number={1}
    title="Install TestFlight"
    actionHref={TESTFLIGHT_APP_URL}
    actionLabel="Get TestFlight from Apple"
    fine="Already have TestFlight? Skip straight to step 2."
  >
    {#snippet body()}
      TestFlight is Apple's app for trying prerelease apps. Install it from the App Store on the
      iPhone or iPad you'll draw on — that keeps the next two steps on the same device.
    {/snippet}
  </BetaStep>

  <BetaStep
    number={2}
    title="Accept the invitation"
    actionHref={TESTFLIGHT_INVITE_URL}
    actionLabel="Open the Splotch invitation"
    fine="The invitation opens in TestFlight once the app is installed."
  >
    {#snippet body()}
      Open Splotch's public invitation and follow Apple's prompt to start testing. TestFlight may
      ask you to sign in with your Apple Account first.
    {/snippet}
  </BetaStep>

  <BetaStep
    number={3}
    title="Install Splotch"
    actionHref={TESTFLIGHT_INVITE_URL}
    actionLabel="Open Splotch in TestFlight"
    fine={`Requires iOS or iPadOS ${MIN_IOS_RELEASE} or newer.`}
  >
    {#snippet body()}
      Splotch now appears inside TestFlight. Tap <strong>Install</strong>, then open it like any
      other app — new beta builds arrive there automatically.
    {/snippet}
  </BetaStep>

  <!-- Step 4 is the only same-origin action. It keeps this page in place
       rather than opening another tab like the three external handoffs. -->
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
      TestFlight can send feedback and screenshots directly, or use the form at
      <a href="/feedback">{FEEDBACK_URL}</a> — bugs, confusing buttons, and “my toddler did
      <em>what</em>?” stories are all genuinely useful.
    {/snippet}
    {#snippet cardBody()}
      Reach out to me at <a href="mailto:{support}">{support}</a> if something is broken, confusing, or
      unexpectedly delightful. Good and bad are both worth hearing.
    {/snippet}
  </BetaStep>
</BetaStepLedger>

<BetaTroubleshooting>
  {#snippet troubleSummary()}
    Invitation not opening, <span class="trouble-sub-clause">beta unavailable,&nbsp;</span>or no
    Install button?
  {/snippet}

  <div class="row">
    <h4>The invitation opens in Safari instead of TestFlight</h4>
    <p>
      Install <a href={TESTFLIGHT_APP_URL} target="_blank" rel="noopener noreferrer"
        >TestFlight from the App Store</a
      > first, then reopen the invitation on the same iPhone or iPad.
    </p>
  </div>
  <div class="row">
    <h4>The beta isn't accepting new testers</h4>
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
    <h4>Splotch appears, but there is no Install button</h4>
    <p>
      Check that the device runs iOS or iPadOS {MIN_IOS_RELEASE} or newer and has enough free storage,
      then close and reopen TestFlight.
    </p>
  </div>
  <div class="row">
    <h4>A new beta build isn't showing up</h4>
    <p>
      Open TestFlight, select Splotch, and look for an Update button. TestFlight may take a little
      while to show a newly released build. Beta builds also expire after 90 days, so an install
      that stopped opening usually just needs that update.
    </p>
  </div>
  <div class="row">
    <h4>Leaving the beta</h4>
    <p>
      Open Splotch in TestFlight, scroll to the bottom, and tap “Stop Testing”. This stops beta
      updates and removes you from the testing group. No hard feelings.
    </p>
  </div>
</BetaTroubleshooting>
