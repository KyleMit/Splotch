<script lang="ts">
  import { onMount } from 'svelte';
  import {
    BETA_OPT_IN_URL,
    MIN_ANDROID_API_LEVEL,
    MIN_ANDROID_RELEASE,
    PLAY_STORE_LISTING_URL,
    TESTERS_GROUP_URL,
  } from '$lib/components/androidBeta/androidBeta';
  import BetaEnrollmentPage from '$lib/components/beta/BetaEnrollmentPage.svelte';
  import BetaStep from '$lib/components/beta/BetaStep.svelte';
  import BetaStepLedger from '$lib/components/beta/BetaStepLedger.svelte';
  import { FEEDBACK_URL } from '$lib/siteUrl';
  import { supportEmail } from '$lib/supportEmail';

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

{#snippet lede()}
  Joining is free and takes three quick steps — plus an optional fourth if you'd like to send
  feedback. Thank you for helping: trying Splotch on a real phone or tablet finds problems we can't
  catch on our own.
{/snippet}

{#snippet troubleSummary()}
  Beta not showing up, <span class="trouble-sub-clause">“item not found”,&nbsp;</span>or stuck on
  step 2?
{/snippet}

{#snippet troubleshooting()}
  <div class="row">
    <h3>“Item not found” on the store link</h3>
    <p>
      You aren't opted in yet, or the browser is signed in to a different Google account. Go back to <a
        href={BETA_OPT_IN_URL}
        target="_blank"
        rel="noopener noreferrer">the tester page</a
      >, check the account shown in the top-right corner, and opt in there first.
    </p>
  </div>
  <div class="row">
    <h3>The tester page says you're not a member</h3>
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
    <h3>The phone can't find the app but your computer can</h3>
    <p>
      The two are signed in to different accounts. In the Play Store app, tap your profile picture
      in the top-right to see which account is active.
    </p>
  </div>
  <div class="row">
    <h3>Everything looks right and Play still disagrees</h3>
    <p>
      Close and reopen the Play Store, check the active account, and try the store link again. As a
      last resort, open Android Settings → Apps → Google Play Store → Storage and clear its cache;
      the exact menu names vary by device.
    </p>
  </div>
  <div class="row">
    <h3>Leaving the beta</h3>
    <p>
      Open <a href={BETA_OPT_IN_URL} target="_blank" rel="noopener noreferrer">the tester page</a>
      again and press “Leave the program”, which stops the beta updates. If a public Android version is
      out by then, you may need to uninstall Splotch and reinstall it from Google Play to switch over;
      until there is one, leaving the beta also means you won't be able to reinstall the Android app.
      No hard feelings.
    </p>
  </div>
{/snippet}

<BetaEnrollmentPage
  title="Join the Android beta"
  wordmark="Splotch for Android"
  {lede}
  {troubleSummary}
  {troubleshooting}
>
  <BetaStepLedger>
    <BetaStep
      number={1}
      title="Join the testers group"
      actionHref={TESTERS_GROUP_URL}
      actionLabel="Join the testers group"
      fine="Google may ask you to sign in first. There's nobody to wait on after that."
      cardLabel="Double check your account"
    >
      {#snippet body()}
        Google Play decides who can see the beta by checking a Google Group, so this has to happen
        first. Click <strong>Join group</strong> at the top.
      {/snippet}
      {#snippet cardBody()}
        Use the <strong>same Google account</strong> that's signed in to the Play Store on your phone
        or tablet. Using a different account is a common reason the beta never shows up.
      {/snippet}
    </BetaStep>

    <BetaStep
      number={2}
      title="Opt in on Google Play"
      actionHref={BETA_OPT_IN_URL}
      actionLabel="Become a tester"
      fine="Sign in with the same account you used in step 1."
      cardLabel="If a link doesn't work yet"
    >
      {#snippet body()}
        Open the tester page and press <strong>Become a tester</strong>. This enrolls you; it
        doesn't install anything yet. Once you're in, the same page should automatically show you a
        link to “Download it on Google Play”, taking you to step 3.
      {/snippet}
      {#snippet cardBody()}
        None of this is instant, and Google Play doesn't always recognize a new group membership
        straight away. Check that both pages are signed in to the same Google account, then make a
        cup of tea and try again a little later before assuming something is broken.
      {/snippet}
    </BetaStep>

    <BetaStep
      number={3}
      title="Install Splotch"
      actionHref={PLAY_STORE_LISTING_URL}
      actionLabel="Open Splotch on Google Play"
      fine={`Open this one on the Android device you want to draw on. Needs Android ${MIN_ANDROID_RELEASE} (API ${MIN_ANDROID_API_LEVEL}) or newer.`}
      cardLabel="Please stay for 14 days"
    >
      {#snippet body()}
        The store listing stays hidden until step 2 is done — before that it just says “item not
        found”. Now it installs like any other app, and updates arrive automatically as new beta
        builds go out.
      {/snippet}
      {#snippet cardBody()}
        Once you're in, <strong>stay opted in for at least 14 days in a row</strong>, even if you've
        seen everything you wanted to in the first ten minutes. Google requires a stretch of
        continuously enrolled testers before Splotch can apply for a public listing, so leaving
        early — or opting out and back in — sets that clock back for everyone. You don't have to
        keep drawing; just stay enrolled.
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
        Found a bug, or thought of something Splotch should do? The form lives at
        <a href="/feedback">{FEEDBACK_URL}</a> — open it on whichever device is handy, or pass it on
        to whoever is doing the testing. Odd crashes, confusing buttons, and “my toddler did
        <em>what</em>?” stories are all genuinely useful.
      {/snippet}
      {#snippet cardBody()}
        Reach out to me at <a href="mailto:{support}">{support}</a> if you need anything at all… something
        is broken, something is confusing, an idea, or just to say your kid liked it. Good and bad are
        both worth hearing.
      {/snippet}
    </BetaStep>
  </BetaStepLedger>
</BetaEnrollmentPage>
