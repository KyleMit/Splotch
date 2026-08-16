<script lang="ts">
  import { onMount } from 'svelte';
  import RuleLabel from '$lib/components/page/RuleLabel.svelte';
  import { FEEDBACK_URL } from '$lib/siteUrl';
  import { supportEmail } from '$lib/supportEmail';
  import BetaStep from './BetaStep.svelte';
  import BetaStepLedger from './BetaStepLedger.svelte';
  import BetaTroubleshooting from './BetaTroubleshooting.svelte';
  import { BETA_OPT_IN_URL, PLAY_STORE_LISTING_URL, TESTERS_GROUP_URL } from './androidBeta';

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

<RuleLabel>How to join on Android</RuleLabel>

<BetaStepLedger>
  <BetaStep
    number={1}
    title="Join the testers group"
    actionHref={TESTERS_GROUP_URL}
    actionLabel="Join the testers group"
  >
    {#snippet body()}
      Press <strong>Join group</strong> at the top — Google Play checks this group to decide who can
      see the beta. Use the <strong>same Google account</strong> that's signed in to the Play Store on
      your phone or tablet.
    {/snippet}
  </BetaStep>

  <BetaStep
    number={2}
    title="Opt in on Google Play"
    actionHref={BETA_OPT_IN_URL}
    actionLabel="Become a tester"
  >
    {#snippet body()}
      Press <strong>Become a tester</strong>, signed in with the same account you used in step 1.
      This enrolls you; it doesn't install anything yet.
    {/snippet}
  </BetaStep>

  <BetaStep
    number={3}
    title="Install Splotch"
    actionHref={PLAY_STORE_LISTING_URL}
    actionLabel="Open Splotch on Google Play"
    cardLabel="Please stay for 14 days"
  >
    {#snippet body()}
      The listing unlocks once step 2 is done. Install it like any other app — beta updates arrive
      automatically from here.
    {/snippet}
    {#snippet cardBody()}
      Google requires a stretch of continuously enrolled testers before Splotch can apply for a
      public listing, so please <strong>stay opted in for at least 14 days in a row</strong>. You
      don't have to keep drawing — just stay enrolled.
    {/snippet}
  </BetaStep>

  <!-- Step 4 is the only same-origin action. It keeps this page in place
       rather than opening another tab like the three external handoffs. -->
  <BetaStep
    number={4}
    title="Tell us what you think"
    actionHref="/feedback"
    actionLabel="Send feedback"
    cardLabel="Or just email me"
    external={false}
    optional
    showCard={!!support}
  >
    {#snippet body()}
      Found a bug, or thought of something Splotch should do? The form lives at
      <a href="/feedback">{FEEDBACK_URL}</a> — odd crashes, confusing buttons, and “my toddler did
      <em>what</em>?” stories are all genuinely useful.
    {/snippet}
    {#snippet cardBody()}
      Anything at all — broken, confusing, an idea, or just to say your kid liked it — reach me at
      <a href="mailto:{support}">{support}</a>. Good and bad are both worth hearing.
    {/snippet}
  </BetaStep>
</BetaStepLedger>

<BetaTroubleshooting>
  {#snippet troubleSummary()}
    Beta not showing up, <span class="trouble-sub-clause">“item not found”,&nbsp;</span>or stuck on
    step 2?
  {/snippet}

  <div class="row">
    <h4>“Item not found” on the store link</h4>
    <p>
      You aren't opted in yet, or the browser is signed in to a different Google account. Go back to <a
        href={BETA_OPT_IN_URL}
        target="_blank"
        rel="noopener noreferrer">the tester page</a
      >, check the account shown in the top-right corner, and opt in there first.
    </p>
  </div>
  <div class="row">
    <h4>The tester page says you're not a member</h4>
    <p>
      Joining is instant and there's no approval to wait on, so either the join never went through
      or it went through on a different Google account. Open <a
        href={TESTERS_GROUP_URL}
        target="_blank"
        rel="noopener noreferrer">the group page</a
      > again, check the account in the top-right corner, and join from there.
    </p>
  </div>
  <div class="row">
    <h4>The phone can't find the app but your computer can</h4>
    <p>
      The two are signed in to different accounts. In the Play Store app, tap your profile picture
      in the top-right to see which account is active.
    </p>
  </div>
  <div class="row">
    <h4>You just joined and the links haven't caught up</h4>
    <p>
      None of this is instant — Google Play doesn't always recognize a new group membership straight
      away. Check that both pages are signed in to the same Google account, then make a cup of tea
      and try again a little later before assuming something is broken.
    </p>
  </div>
  <div class="row">
    <h4>Everything looks right and Play still disagrees</h4>
    <p>
      Close and reopen the Play Store, check the active account, and try the store link again. As a
      last resort, open Android Settings → Apps → Google Play Store → Storage and clear its cache;
      the exact menu names vary by device.
    </p>
  </div>
  <div class="row">
    <h4>Leaving the beta</h4>
    <p>
      Open <a href={BETA_OPT_IN_URL} target="_blank" rel="noopener noreferrer">the tester page</a>
      again and press “Leave the program”, which stops the beta updates. If a public Android version is
      out by then, you may need to uninstall Splotch and reinstall it from Google Play to switch over;
      until there is one, leaving the beta also means you won't be able to reinstall the Android app.
      No hard feelings.
    </p>
  </div>
</BetaTroubleshooting>
