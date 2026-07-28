<script lang="ts">
  import {
    BETA_OPT_IN_URL,
    FEEDBACK_ISSUE_URL,
    MIN_ANDROID_API_LEVEL,
    MIN_ANDROID_RELEASE,
    PLAY_STORE_LISTING_URL,
    TESTERS_GROUP_EMAIL,
    TESTERS_GROUP_URL,
  } from './androidBeta';

  // Sign-up instructions for the Google Play closed test. The ordering of the
  // two Play links is the whole point of the page: the store listing is dark
  // for anyone who has not opted in yet, so the opt-in page has to come first
  // or a would-be tester lands on "item not found" and gives up.
</script>

<svelte:head>
  <title>Join the Android Beta · Splotch</title>
  <meta
    name="description"
    content="How to become an Android beta tester for Splotch: join the testers group, opt in on Google Play, and install the app."
  />
</svelte:head>

<main class="beta">
  <div class="sheet">
    <a class="back" href="/">← Back to drawing</a>

    <!-- Non-breaking space so a narrow screen never strands the emoji on its own line. -->
    <h1>Join the Android Beta&nbsp;<span aria-hidden="true">🤖</span></h1>

    <p class="intro">
      Splotch for Android is in <strong>closed testing</strong> on Google Play. Testing is free, takes
      two steps, and you can leave whenever you like. Thank you for helping — the app gets better because
      people like you tried it on a real phone.
    </p>

    <ol class="steps">
      <li>
        <h2>Join the testers group</h2>
        <p>
          Google Play decides who can see the beta by checking a Google Group, so this has to happen
          first.
        </p>
        <p>
          <a href={TESTERS_GROUP_URL} target="_blank" rel="noopener noreferrer" class="cta primary">
            Join the testers group
          </a>
        </p>
        <p class="fine">
          Prefer email? Send a note to
          <a href="mailto:{TESTERS_GROUP_EMAIL}">{TESTERS_GROUP_EMAIL}</a> to ask for an invite.
        </p>
        <p class="callout">
          <strong>Use the same Google account</strong> that's signed in to the Play Store on your phone
          or tablet. Joining with a different account is far and away the most common reason the beta
          never shows up.
        </p>
      </li>

      <li>
        <h2>Opt in on Google Play</h2>
        <p>
          Open the tester page and press <strong>“Become a tester”</strong>. When it works, the page
          switches to “You're a tester” and offers a download link.
        </p>
        <p>
          <a href={BETA_OPT_IN_URL} target="_blank" rel="noopener noreferrer" class="cta primary">
            Become a tester
          </a>
        </p>
        <p class="fine">
          This page works in any browser, on a phone or a computer — just make sure it's signed in
          to the account from step 1.
        </p>
      </li>

      <li>
        <h2>Install Splotch</h2>
        <p>
          Once you're opted in, the normal store listing opens for you and installs like any other
          app. Updates arrive automatically as new beta builds go out.
        </p>
        <p>
          <a
            href={PLAY_STORE_LISTING_URL}
            target="_blank"
            rel="noopener noreferrer"
            class="cta secondary"
          >
            Open Splotch on Google Play
          </a>
        </p>
        <p class="fine">
          Open this one on the Android device you want to draw on. Splotch needs Android {MIN_ANDROID_RELEASE}
          (API {MIN_ANDROID_API_LEVEL}) or newer.
        </p>
      </li>
    </ol>

    <h2>Give it a minute</h2>
    <p>
      None of this is instant. Group membership has to reach Google Play before Play will treat you
      as a tester, which usually takes a few minutes but can take a few hours. If a link doesn't
      work on the first try, it's very often just early — make a cup of tea and try again before
      assuming something is broken.
    </p>

    <h2>If it still isn't showing up</h2>
    <ul>
      <li>
        <strong>“Item not found” on the store link.</strong> You aren't opted in yet, or the browser
        is signed in to a different Google account. Go back to
        <a href={BETA_OPT_IN_URL} target="_blank" rel="noopener noreferrer">the tester page</a>,
        check the account shown in the top-right corner, and opt in there first.
      </li>
      <li>
        <strong>The tester page says you're not a member.</strong> Your request to join the group hasn't
        gone through yet, or it went through on another account. Check the inbox of the account you used
        for the group's confirmation.
      </li>
      <li>
        <strong>The phone can't find the app but your computer can.</strong> The two are signed in to
        different accounts. In the Play Store app, tap your profile picture in the top-right to see which
        account is active.
      </li>
      <li>
        <strong>Everything looks right and Play still disagrees.</strong> The Play Store app caches hard.
        Pull down to refresh it, or go to Settings → Apps → Google Play Store → Storage → Clear cache,
        then reopen the store.
      </li>
    </ul>

    <h2>What to expect</h2>
    <ul>
      <li>Beta builds ship more often than public ones, so expect the occasional rough edge.</li>
      <li>
        Your drawings live on your device. Nothing is uploaded, and there are no ads, accounts, or
        tracking — exactly like the public app. See the <a href="/privacy">Privacy Policy</a>.
      </li>
      <li>Everything works offline, so a plane or a car park is fair game.</li>
    </ul>

    <h2>Telling us what you think</h2>
    <p>
      This is the part that matters. Inside the app, tap the <strong>“?”</strong> button to open the
      Parent Center and choose <strong>“Send report”</strong> to file a bug or suggest a feature
      without leaving Splotch. You can also
      <a href={FEEDBACK_ISSUE_URL} target="_blank" rel="noopener noreferrer"
        >open an issue on GitHub</a
      >. Odd crashes, confusing buttons, and “my toddler did <em>what</em>?” stories are all
      genuinely useful.
    </p>

    <h2>Leaving the beta</h2>
    <p>
      Open <a href={BETA_OPT_IN_URL} target="_blank" rel="noopener noreferrer">the tester page</a>
      again and press “Leave the program”. Google Play moves you back to the public version — you may
      need to uninstall and reinstall Splotch for that to take effect. No hard feelings.
    </p>

    <h2>Don't want to install anything?</h2>
    <p>
      Splotch runs in a browser at <a href="/">splotch.art</a> with no beta, no store, and no sign-up.
      Add it to your home screen and it behaves much like the installed app.
    </p>
  </div>
</main>

<style>
  /* Unlike /privacy and /admin, this page is fully themed: it's new, so it has
     no contrast-pinned palette to preserve, and every color it needs already
     exists as a token. The drawing route's app-surface locks (app.css) don't
     reach here, so it scrolls, selects, and zooms as a normal document. */
  .beta {
    min-height: 100vh;
    background: var(--app-bg);
    padding: var(--space-6) var(--space-4) var(--space-8);
    color: var(--text);
    line-height: 1.6;
  }

  .sheet {
    max-width: 680px;
    margin: 0 auto;
    background: var(--surface);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-sm);
    padding: var(--space-7) clamp(var(--space-5), 5vw, var(--space-8)) var(--space-8);
  }

  .back {
    display: inline-block;
    margin-bottom: var(--space-5);
    text-decoration: none;
    font-weight: var(--font-weight-semibold);
  }

  h1 {
    font-size: clamp(1.8rem, 5vw, 2.4rem);
    color: var(--brand);
    margin-bottom: var(--space-2);
  }

  h2 {
    font-size: var(--font-size-2xl);
    color: var(--brand-text);
    margin: var(--space-7) 0 var(--space-2);
  }

  .intro {
    font-size: var(--font-size-xl);
    margin-bottom: var(--space-6);
  }

  p {
    margin-bottom: var(--space-3);
  }

  ul {
    margin: 0 0 var(--space-3);
    padding-left: 1.2em;
  }

  ul li {
    margin-bottom: var(--space-2);
  }

  a {
    color: var(--brand-text);
  }

  @media (hover: hover) {
    a:hover {
      text-decoration: none;
    }
  }

  /* Numbered step cards. The marker is drawn as a brand disc in the gutter so
     the three steps read as a sequence at a glance rather than as prose. */
  .steps {
    list-style: none;
    padding: 0;
    margin: 0;
    counter-reset: step;
  }

  .steps > li {
    counter-increment: step;
    position: relative;
    background: var(--surface-2);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-5) var(--space-5) var(--space-4);
    margin-bottom: var(--space-4);
  }

  .steps > li::before {
    content: counter(step);
    position: absolute;
    top: var(--space-5);
    left: var(--space-5);
    width: 32px;
    height: 32px;
    border-radius: var(--radius-pill);
    background: var(--brand);
    color: var(--on-brand);
    font-weight: var(--font-weight-semibold);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Clear the disc in the gutter; the rest of the card runs full width. */
  .steps h2 {
    margin: 0 0 var(--space-2);
    padding-left: calc(32px + var(--space-3));
    min-height: 32px;
    display: flex;
    align-items: center;
    font-size: var(--font-size-xl);
    color: var(--text-strong);
  }

  .steps p:last-child {
    margin-bottom: 0;
  }

  /* Link styled as a button. Not the Button primitive: that renders a <button>,
     and these are navigations.

     Both weights are drawn from --brand-wash/--brand-text rather than a solid
     --brand fill: --on-brand on --brand is 3.39:1, which clears AA only for
     large text, and at button size axe flags it (serious). The step the reader
     is meant to take next is marked by a --brand outline instead of a stronger
     fill. */
  .cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-3) var(--space-5);
    border-radius: var(--radius-md);
    font-weight: var(--font-weight-semibold);
    text-decoration: none;
    transition:
      background var(--duration-base) ease,
      transform var(--duration-fast) ease;
  }

  .cta:active {
    transform: scale(0.96);
  }

  .primary,
  .secondary {
    background: var(--brand-wash);
    color: var(--brand-text);
  }

  .primary {
    border: 2px solid var(--brand);
  }

  @media (hover: hover) {
    .primary:hover,
    .secondary:hover {
      background: var(--brand-wash-hover);
    }
  }

  .fine {
    font-size: var(--font-size-md);
    color: var(--text-mid);
  }

  /* The "same Google account" warning — the one thing that silently breaks the
     whole flow, so it gets a tinted panel rather than another paragraph. */
  .callout {
    background: var(--brand-wash);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4);
    font-size: var(--font-size-md);
  }
</style>
