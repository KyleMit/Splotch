<script lang="ts">
  import { onMount } from 'svelte';
  import {
    BETA_OPT_IN_URL,
    FEEDBACK_ISSUE_URL,
    MIN_ANDROID_API_LEVEL,
    MIN_ANDROID_RELEASE,
    PLAY_STORE_LISTING_URL,
    TESTERS_GROUP_URL,
    supportEmail,
  } from '$lib/androidBeta';
  import Icon from '$lib/components/Icon.svelte';

  // Composed after hydration so the support address never appears in the
  // prerendered HTML, which is what address harvesters scrape. Without JS the
  // note is simply absent — step 4 still offers the in-app report and GitHub.
  let support = $state('');
  onMount(() => {
    support = supportEmail();
  });

  // The three sign-up steps of /android-beta. They are sequential, not a menu:
  // opting in enrols without installing, and the store listing stays a 404
  // until it is done — so each step says what it unlocks.
  //
  // Colors come from the --beta-* custom properties the route declares; they
  // inherit through the component boundary, so this stays light-only with the
  // page rather than carrying a second palette.
</script>

<div class="band ledger">
  <h2 class="section-label">How to join</h2>
  <p class="ledger-intro">
    Three steps, in order — each one unlocks the next. Google Play won't show you the app until the
    first two are done.
  </p>

  <ol class="steps">
    <li>
      <span class="num">1</span>
      <div>
        <h3>Join the testers group</h3>
        <p class="step-body">
          Google Play decides who can see the beta by checking a Google Group, so this has to happen
          first.
        </p>
        <p class="action-row">
          <a class="btn" href={TESTERS_GROUP_URL} target="_blank" rel="noopener noreferrer">
            Join the testers group
          </a>
        </p>
        <p class="hint">
          Google may ask you to sign in or to request access before it lets you in.
        </p>
        <div class="note">
          <p class="note-label">The one thing to get right</p>
          <p class="note-body">
            Use the <strong>same Google account</strong> that's signed in to the Play Store on your phone
            or tablet. Using a different account is a common reason the beta never shows up.
          </p>
        </div>
      </div>
    </li>

    <li>
      <span class="num">2</span>
      <div>
        <h3>Opt in on Google Play</h3>
        <p class="step-body">
          Open the tester page and press <strong>Become a tester</strong>. This enrols you; it
          doesn't install anything yet. Once you're in, the same page grows a “Download it on Google
          Play” link — that's step 3.
        </p>
        <p class="action-row">
          <a class="btn" href={BETA_OPT_IN_URL} target="_blank" rel="noopener noreferrer">
            Become a tester
          </a>
        </p>
        <div class="note">
          <p class="note-label">If a link doesn't work yet</p>
          <p class="note-body">
            None of this is instant, and Google Play doesn't always recognise a new group membership
            straight away. Check that both pages are signed in to the same Google account, then make
            a cup of tea and try again a little later before assuming something is broken.
          </p>
        </div>
      </div>
    </li>

    <li>
      <span class="num">3</span>
      <div>
        <h3>Install Splotch</h3>
        <p class="step-body">
          The store listing stays hidden until step 2 is done — before that it just says “item not
          found”. Now it installs like any other app, and updates arrive automatically as new beta
          builds go out.
        </p>
        <p class="action-row">
          <a class="btn" href={PLAY_STORE_LISTING_URL} target="_blank" rel="noopener noreferrer">
            Open Splotch on Google Play
          </a>
        </p>
        <p class="hint">
          Open this one on the Android device you want to draw on. Splotch needs Android {MIN_ANDROID_RELEASE}
          (API {MIN_ANDROID_API_LEVEL}) or newer.
        </p>
        <div class="note">
          <p class="note-label">Please stay for 14 days</p>
          <p class="note-body">
            Once you're in, <strong>stay opted in for at least 14 days in a row</strong>, even if
            you've seen everything you wanted to in the first ten minutes. Google requires a stretch
            of continuously enrolled testers before Splotch can apply for a public listing, so
            leaving early — or opting out and back in — sets that clock back for everyone. You don't
            have to keep drawing; just stay enrolled.
          </p>
        </div>
      </div>
    </li>

    <li class="optional-step">
      <span class="num">4</span>
      <div>
        <h3>Tell us what you think <span class="optional">Optional</span></h3>
        <p class="step-body">
          This is the part that matters. Inside the app, tap the
          <Icon name="parent" class="inline-icon" role="img" aria-label="Parent Center" /> button in the
          bottom-right corner of the drawing screen to open the Parent Center, then choose
          <strong>Send report</strong> to file a bug or suggest a feature without leaving Splotch.
          You can also
          <a href={FEEDBACK_ISSUE_URL} target="_blank" rel="noopener noreferrer"
            >open an issue on GitHub</a
          >. Odd crashes, confusing buttons, and “my toddler did <em>what</em>?” stories are all
          genuinely useful.
        </p>
        {#if support}
          <div class="note">
            <p class="note-label">Or just email us</p>
            <p class="note-body">
              <a href="mailto:{support}">{support}</a> reaches a human. Anything at all — something broken,
              something confusing, an idea, or just to say your kid liked it. Good and bad are both worth
              hearing.
            </p>
          </div>
        {/if}
      </div>
    </li>
  </ol>
</div>

<style>
  .ledger {
    padding: 36px var(--beta-gutter) 44px;
  }

  .section-label {
    margin: 0 0 4px;
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--beta-label);
  }

  .ledger-intro {
    margin: 6px 0 0;
    font-size: 15px;
    color: var(--beta-muted);
    max-width: 60ch;
  }

  /* A ledger, not cards: hairline rules and a numeral gutter carry the sequence,
     so nothing needs a background or a badge. */
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .steps > li {
    display: grid;
    grid-template-columns: 46px 1fr;
    gap: 0 18px;
    border-top: 1px solid var(--beta-rule);
    margin-top: 32px;
    padding-top: 28px;
  }

  /* Step 4 asks for something back rather than moving the install along, so it
     gets more air above the same hairline — a section break, not a fourth
     instruction, while the numbering carries straight on. */
  .steps > li.optional-step {
    margin-top: 52px;
  }

  .optional {
    margin-left: 8px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--beta-muted);
    vertical-align: 0.18em;
  }

  /* The real Parent Center glyph, sized to the surrounding text so the sentence
     shows the button rather than describing it. Icon renders its SVG at 100% of
     this box, so the box has to carry the size. */
  .step-body :global(.inline-icon) {
    width: 1.3em;
    height: 1.3em;
    vertical-align: -0.3em;
  }

  a {
    color: var(--beta-link);
    text-underline-offset: 3px;
    text-decoration-thickness: 1px;
  }

  .steps > li:first-child {
    margin-top: 16px;
    padding-top: 26px;
  }

  .num {
    font-size: 26px;
    font-weight: 700;
    color: var(--beta-numeral);
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  h3 {
    margin: 0 0 8px;
    font-size: 19px;
    font-weight: 700;
    color: var(--beta-ink);
    line-height: 1.3;
  }

  .step-body {
    margin: 0 0 18px;
    color: var(--beta-body);
    max-width: 54ch;
  }

  .step-body strong {
    color: var(--beta-ink);
  }

  .action-row {
    margin: 0;
  }

  .btn {
    display: inline-block;
    background: var(--beta-link);
    color: var(--beta-on-accent);
    border-radius: var(--radius-md);
    padding: 12px 22px;
    font-weight: 600;
    font-size: 15.5px;
    text-decoration: none;
    box-shadow: 0 2px 6px rgba(124, 77, 207, 0.3);
    transition: background var(--duration-base) ease;
  }

  .hint {
    margin: 14px 0 0;
    font-size: 14px;
    color: var(--beta-muted);
    max-width: 56ch;
  }

  .note {
    margin: 22px 0 0;
    padding: 16px 18px;
    background: var(--beta-tint);
    border: 1px solid var(--beta-rule);
    border-radius: var(--radius-md);
  }

  .note-label {
    margin: 0 0 6px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--beta-eyebrow);
  }

  .note-body {
    margin: 0;
    font-size: 15px;
    color: var(--beta-body-strong);
  }

  .note-body strong {
    color: var(--beta-ink);
  }

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it stuck until the next tap elsewhere. */
  @media (hover: hover) {
    .btn:hover {
      background: var(--beta-link-hover);
    }

    a:not(.btn):hover {
      color: var(--beta-link-hover);
    }
  }
</style>
