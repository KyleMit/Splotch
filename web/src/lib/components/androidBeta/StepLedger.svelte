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
  } from './androidBeta';
  import Icon from '$lib/components/Icon.svelte';
  import { paletteHex } from '$lib/palette';

  // Composed after hydration so the support address never appears in the
  // prerendered HTML, which is what address harvesters scrape. Without JS the
  // note is simply absent — step 4 still offers the in-app report and GitHub.
  let support = $state('');
  onMount(() => {
    support = supportEmail();
  });

  // The four sign-up steps. Steps 1-3 are sequential — opting in enrols without
  // installing, and the store listing stays a 404 until it is done — and step 4
  // is the optional ask afterwards.
  //
  // Each numeral takes its own crayon hue, tying the list back to the masthead
  // strip. Read out of palette.ts rather than written as hexes here, which
  // palette-source.test.mjs requires and which makes a renamed swatch fail loudly.
  const NUMERAL_INK = ['Red', 'Orange', 'Green', 'Blue'].map(paletteHex);

  // Colors come from the --beta-* custom properties the route declares; they
  // inherit through the component boundary, so this stays light-only with the
  // page rather than carrying a second palette.
</script>

<ol class="steps">
  <li>
    <span class="num" style="color:{NUMERAL_INK[0]}">1</span>
    <div class="content">
      <div class="head"><h3>Join the testers group</h3></div>
      <p class="body">
        Google Play decides who can see the beta by checking a Google Group, so this has to happen
        first.
      </p>
      <div class="action">
        <a class="btn" href={TESTERS_GROUP_URL} target="_blank" rel="noopener noreferrer">
          Join the testers group
        </a>
        <p class="fine">
          Google may ask you to sign in or to request access before it lets you in.
        </p>
      </div>
      <div class="card" style="--card-accent:{NUMERAL_INK[0]}">
        <span class="bar"></span>
        <div>
          <p class="card-label alert">The one thing to get right</p>
          <p class="card-body">
            Use the <strong>same Google account</strong> that's signed in to the Play Store on your phone
            or tablet. Using a different account is a common reason the beta never shows up.
          </p>
        </div>
      </div>
    </div>
  </li>

  <li>
    <span class="num" style="color:{NUMERAL_INK[1]}">2</span>
    <div class="content">
      <div class="head"><h3>Opt in on Google Play</h3></div>
      <p class="body">
        Open the tester page and press <strong>Become a tester</strong>. This enrols you; it doesn't
        install anything yet. Once you're in, the same page grows a “Download it on Google Play”
        link — that's step 3.
      </p>
      <div class="action">
        <a class="btn" href={BETA_OPT_IN_URL} target="_blank" rel="noopener noreferrer">
          Become a tester
        </a>
      </div>
      <div class="card" style="--card-accent:{NUMERAL_INK[1]}">
        <span class="bar"></span>
        <div>
          <p class="card-label warn">If a link doesn't work yet</p>
          <p class="card-body">
            None of this is instant, and Google Play doesn't always recognise a new group membership
            straight away. Check that both pages are signed in to the same Google account, then make
            a cup of tea and try again a little later before assuming something is broken.
          </p>
        </div>
      </div>
    </div>
  </li>

  <li>
    <span class="num" style="color:{NUMERAL_INK[2]}">3</span>
    <div class="content">
      <div class="head"><h3>Install Splotch</h3></div>
      <p class="body">
        The store listing stays hidden until step 2 is done — before that it just says “item not
        found”. Now it installs like any other app, and updates arrive automatically as new beta
        builds go out.
      </p>
      <div class="action">
        <a class="btn" href={PLAY_STORE_LISTING_URL} target="_blank" rel="noopener noreferrer">
          Open Splotch on Google Play
        </a>
        <p class="fine">
          Open this one on the Android device you want to draw on. Splotch needs Android {MIN_ANDROID_RELEASE}
          (API {MIN_ANDROID_API_LEVEL}) or newer.
        </p>
      </div>
      <div class="card" style="--card-accent:{NUMERAL_INK[2]}">
        <span class="bar"></span>
        <div>
          <p class="card-label go">Please stay for 14 days</p>
          <p class="card-body">
            Once you're in, <strong>stay opted in for at least 14 days in a row</strong>, even if
            you've seen everything you wanted to in the first ten minutes. Google requires a stretch
            of continuously enrolled testers before Splotch can apply for a public listing, so
            leaving early — or opting out and back in — sets that clock back for everyone. You don't
            have to keep drawing; just stay enrolled.
          </p>
        </div>
      </div>
    </div>
  </li>

  <li>
    <span class="num" style="color:{NUMERAL_INK[3]}">4</span>
    <div class="content">
      <div class="head">
        <h3>Tell us what you think</h3>
        <span class="optional">Optional</span>
      </div>
      <p class="body">
        This is the part that matters. Inside the app, tap the
        <Icon name="parent" class="inline-icon" role="img" aria-label="Parent Center" /> button in the
        bottom-right corner of the drawing screen to open the Parent Center, then choose
        <strong>Send report</strong> to file a bug or suggest a feature without leaving Splotch. You
        can also
        <a href={FEEDBACK_ISSUE_URL} target="_blank" rel="noopener noreferrer"
          >open an issue on GitHub</a
        >. Odd crashes, confusing buttons, and “my toddler did <em>what</em>?” stories are all
        genuinely useful.
      </p>
      {#if support}
        <div class="card" style="--card-accent:{NUMERAL_INK[3]}">
          <span class="bar"></span>
          <div>
            <p class="card-label info">Or just email us</p>
            <p class="card-body">
              <a href="mailto:{support}">{support}</a> reaches a human. Anything at all — something broken,
              something confusing, an idea, or just to say your kid liked it. Good and bad are both worth
              hearing.
            </p>
          </div>
        </div>
      {/if}
    </div>
  </li>
</ol>

<style>
  /* No rules between steps: the gap and the colored numeral do the separating,
     so the only hairline on the page is the section label's. */
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 44px;
  }

  .steps > li {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    gap: 0 18px;
  }

  .content {
    max-width: 600px;
  }

  .num {
    font-size: 26px;
    font-weight: 700;
    line-height: 1.15;
    font-variant-numeric: tabular-nums;
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }

  h3 {
    margin: 0;
    font-size: 21px;
    font-weight: 700;
    line-height: 1.25;
    color: var(--beta-ink);
  }

  .optional {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--beta-muted);
  }

  .body {
    margin: 10px 0 0;
    font-size: 16px;
    font-weight: 500;
    line-height: 1.65;
    color: var(--beta-body);
    text-wrap: pretty;
  }

  .body strong {
    color: var(--beta-ink);
  }

  /* Fine print sits beside its button rather than under it, so a step reads as
     one action with a caveat instead of a stack of blocks. */
  .action {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
    margin-top: 20px;
  }

  .btn {
    display: inline-block;
    padding: 15px 24px;
    border-radius: 14px;
    background: var(--beta-link);
    color: var(--beta-on-accent);
    font-size: 15px;
    font-weight: 700;
    text-decoration: none;
    transition:
      background var(--duration-base) ease,
      transform var(--duration-fast) ease;
  }

  .btn:active {
    transform: scale(0.97);
  }

  .fine {
    margin: 0;
    max-width: 260px;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.5;
    color: var(--beta-muted);
  }

  /* Every step closes on a callout carrying its own crayon accent, so the four
     read as one system rather than as two competing note styles. */
  .card {
    display: flex;
    gap: 14px;
    margin-top: 22px;
    padding: 16px 18px;
    border-radius: 14px;
    background: var(--beta-warm);
  }

  .bar {
    flex: 0 0 4px;
    border-radius: 999px;
    background: var(--card-accent);
  }

  .card-label {
    margin: 0 0 4px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  /* Each card label takes a darkened tint of its step's crayon hue: the raw
     palette hues are ~2.6:1 on the warm tint. Deeper shades that clear AA, and
     not palette values, so they live in the route's local palette. */
  .alert {
    color: var(--beta-alert-ink);
  }

  .warn {
    color: var(--beta-warn-ink);
  }

  .go {
    color: var(--beta-go-ink);
  }

  .info {
    color: var(--beta-info-ink);
  }

  .card-body {
    margin: 0;
    font-size: 15px;
    font-weight: 500;
    line-height: 1.6;
    color: var(--beta-note);
  }

  .card-body strong {
    color: var(--beta-ink);
  }

  /* The real Parent Center glyph, sized to the surrounding text so the sentence
     shows the button rather than describing it. Icon renders its SVG at 100% of
     this box, so the box has to carry the size. */
  .body :global(.inline-icon) {
    width: 1.3em;
    height: 1.3em;
    vertical-align: -0.3em;
  }

  a:not(.btn) {
    color: var(--beta-link);
    text-underline-offset: 3px;
    text-decoration-thickness: 1px;
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

  @media (max-width: 540px) {
    .steps > li {
      grid-template-columns: 26px minmax(0, 1fr);
      gap: 0 14px;
    }

    .num {
      font-size: 22px;
    }

    h3 {
      font-size: 19px;
    }

    .body {
      font-size: 15px;
    }

    /* Full-width tap target; the fine print drops below it. */
    .action {
      gap: 12px;
    }

    .btn {
      flex: 1 0 100%;
      min-height: 48px;
      text-align: center;
    }

    .fine {
      max-width: none;
    }
  }
</style>
