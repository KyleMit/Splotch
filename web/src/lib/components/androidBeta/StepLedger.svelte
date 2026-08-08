<script lang="ts">
  import { onMount } from 'svelte';
  import {
    BETA_OPT_IN_URL,
    MIN_ANDROID_API_LEVEL,
    MIN_ANDROID_RELEASE,
    PLAY_STORE_LISTING_URL,
    TESTERS_GROUP_URL,
  } from './androidBeta';
  import { supportEmail } from '$lib/supportEmail';
  import { SITE_ORIGIN } from '$lib/siteUrl';
  import { paletteHex, type PaletteLabel } from '$lib/palette';

  // Step 4 shows this rather than linking the word "feedback": the sign-up page
  // is read on one device and often acted on from another, so the address has to
  // survive being copied or read aloud. The href beside it stays relative, so a
  // deploy preview links to itself.
  const FEEDBACK_URL = `${SITE_ORIGIN}/feedback`;

  // Composed after hydration so the support address never appears in the
  // prerendered HTML, which is what address harvesters scrape. Without JS the
  // card is simply absent; step 4's /feedback button is the path that survives,
  // and that page posts through a form action so it works without JS too.
  let support = $state('');
  onMount(() => {
    support = supportEmail();
  });

  // The four sign-up steps. Steps 1-3 are sequential — opting in enrolls without
  // installing, and the store listing stays a 404 until it is done — and step 4
  // is the optional ask afterwards.
  //
  // Each step carries its own crayon hue on the rail of its callout, tying the
  // list back to the masthead strip. Read out of palette.ts rather than written
  // as hexes here, which palette-source.test.mjs requires and which makes a
  // renamed swatch fail loudly.
  //
  // Nothing that carries text uses these: three of the four raw hues are
  // 2.0-2.7:1 on the sheet. The numeral and the callout label take the darkened
  // --step-*-ink of the same step instead, over its --step-*-wash.
  const CARD_ACCENT_LABELS: PaletteLabel[] = ['Red', 'Orange', 'Green', 'Blue'];
  const CARD_ACCENT = CARD_ACCENT_LABELS.map(paletteHex);

  // Ink, body, muted, link and measure come from the --page-* palette PageShell
  // declares and /android-beta pins to light-only values; they inherit through
  // the component boundary. The step washes below are this ledger's own, so
  // they live in its style block rather than on the route.
</script>

<ol class="steps">
  <li class="step-1">
    <div class="head">
      <span class="num">1</span>
      <h3>Join the testers group</h3>
    </div>
    <p class="body">
      Google Play decides who can see the beta by checking a Google Group, so this has to happen
      first. Click <strong>Join group</strong> at the top.
    </p>
    <div class="action">
      <a class="btn" href={TESTERS_GROUP_URL} target="_blank" rel="noopener noreferrer">
        Join the testers group
      </a>
      <p class="fine">Google may ask you to sign in first. There's nobody to wait on after that.</p>
    </div>
    <div class="card" style="--card-accent:{CARD_ACCENT[0]}">
      <p class="card-label">Double check your account</p>
      <p class="card-body">
        Use the <strong>same Google account</strong> that's signed in to the Play Store on your phone
        or tablet. Using a different account is a common reason the beta never shows up.
      </p>
    </div>
  </li>

  <li class="step-2">
    <div class="head">
      <span class="num">2</span>
      <h3>Opt in on Google Play</h3>
    </div>
    <p class="body">
      Open the tester page and press <strong>Become a tester</strong>. This enrolls you; it doesn't
      install anything yet. Once you're in, the same page should automatically show you a link to
      “Download it on Google Play”, taking you to step 3.
    </p>
    <div class="action">
      <a class="btn" href={BETA_OPT_IN_URL} target="_blank" rel="noopener noreferrer">
        Become a tester
      </a>
      <p class="fine">Sign in with the same account you used in step 1.</p>
    </div>
    <div class="card" style="--card-accent:{CARD_ACCENT[1]}">
      <p class="card-label">If a link doesn't work yet</p>
      <p class="card-body">
        None of this is instant, and Google Play doesn't always recognize a new group membership
        straight away. Check that both pages are signed in to the same Google account, then make a
        cup of tea and try again a little later before assuming something is broken.
      </p>
    </div>
  </li>

  <li class="step-3">
    <div class="head">
      <span class="num">3</span>
      <h3>Install Splotch</h3>
    </div>
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
        Open this one on the Android device you want to draw on. Needs Android {MIN_ANDROID_RELEASE}
        (API {MIN_ANDROID_API_LEVEL}) or newer.
      </p>
    </div>
    <div class="card" style="--card-accent:{CARD_ACCENT[2]}">
      <p class="card-label">Please stay for 14 days</p>
      <p class="card-body">
        Once you're in, <strong>stay opted in for at least 14 days in a row</strong>, even if you've
        seen everything you wanted to in the first ten minutes. Google requires a stretch of
        continuously enrolled testers before Splotch can apply for a public listing, so leaving
        early — or opting out and back in — sets that clock back for everyone. You don't have to
        keep drawing; just stay enrolled.
      </p>
    </div>
  </li>

  <li class="step-4">
    <div class="head">
      <span class="num">4</span>
      <h3>Tell us what you think</h3>
      <span class="optional">Optional</span>
    </div>
    <p class="body">
      Found a bug, or thought of something Splotch should do? The form lives at
      <a href="/feedback">{FEEDBACK_URL}</a> — open it on whichever device is handy, or pass it on
      to whoever is doing the testing. Odd crashes, confusing buttons, and “my toddler did
      <em>what</em>?” stories are all genuinely useful.
    </p>
    <div class="action">
      <!-- The only same-origin destination in the ledger, so no target/rel: the
           other three hand the reader off to Google and should come back to an
           untouched sign-up page. -->
      <a class="btn" href="/feedback">Send feedback</a>
      <p class="fine">
        No account, nothing to install; your note goes to our private support tracker.
      </p>
    </div>
    {#if support}
      <div class="card" style="--card-accent:{CARD_ACCENT[3]}">
        <p class="card-label">Or just email me</p>
        <p class="card-body">
          Reach out to me at <a href="mailto:{support}">{support}</a> if you need anything at all… something
          is broken, something is confusing, an idea, or just to say your kid liked it. Good and bad are
          both worth hearing.
        </p>
      </div>
    {/if}
  </li>
</ol>

<style>
  /* No rules between steps: the numeral gutter carries a hairline rail instead,
     so the four read as one sequence rather than four unrelated blocks. The
     rail's geometry is derived from these, which is why they are named — the
     segment under each step has to land exactly on the next step's numeral. */
  .steps {
    /* Each step is a crayon hue in two strengths: a 5% wash behind its numeral
       and under its callout, and a darkened ink for the numeral and the callout
       label. The raw palette hues are ~2.6:1 and carry no text; these deeper
       shades measure 5.3, 4.9, 4.7, 4.9:1 on their own wash. Neither is a
       palette value, so palette-source.test.mjs does not own them — the full
       hues on the callout rails are read out of lib/palette.ts instead.
       Light-only, like the page they render on. */
    --step-1-wash: #fdf3f2; /* Red */
    --step-1-ink: #b03f3b;
    --step-2-wash: #fdf7ef; /* Orange */
    --step-2-ink: #a35a00;
    --step-3-wash: #f3f9ef; /* Green */
    --step-3-ink: #4f7a36;
    --step-4-wash: #f0f6fc; /* Blue */
    --step-4-ink: #2a6db8;
    /* The connector between the step numerals. Decorative — the numerals and
       their order carry the sequence, so this sits below the 3:1 floor by
       design. */
    --rail-color: #efeced;
    --callout-ink: #4a4a54; /* ~ --text on a callout wash */

    --step-gap: 52px;
    --num-size: 32px;
    /* The numeral plus the space between it and the text column. */
    --num-gutter: 52px;
    --rail-width: 2px;
    /* How far the rail stops short of the numerals it runs between. */
    --rail-inset: 8px;

    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--step-gap);
  }

  .steps > li {
    position: relative;
    padding-left: var(--num-gutter);
  }

  .step-1 {
    --step-wash: var(--step-1-wash);
    --step-ink: var(--step-1-ink);
  }

  .step-2 {
    --step-wash: var(--step-2-wash);
    --step-ink: var(--step-2-ink);
  }

  .step-3 {
    --step-wash: var(--step-3-wash);
    --step-ink: var(--step-3-ink);
  }

  .step-4 {
    --step-wash: var(--step-4-wash);
    --step-ink: var(--step-4-ink);
  }

  /* One segment per step rather than one rail down the whole list: the bottom
     of a step is a known distance from the next numeral (the flex gap), while
     the height of the last step's content is not. */
  .steps > li:not(:last-child)::before {
    content: '';
    position: absolute;
    left: calc((var(--num-size) - var(--rail-width)) / 2);
    top: calc(var(--num-size) + var(--rail-inset));
    bottom: calc(var(--rail-inset) - var(--step-gap));
    width: var(--rail-width);
    background: var(--rail-color);
  }

  /* The head is exactly one numeral tall, so the numeral it holds on desktop can
     be lifted into the gutter and still line up with the title. */
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    min-height: var(--num-size);
  }

  .num {
    position: absolute;
    left: 0;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 var(--num-size);
    width: var(--num-size);
    height: var(--num-size);
    border-radius: 50%;
    background: var(--step-wash);
    color: var(--step-ink);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    font-variant-numeric: tabular-nums;
  }

  h3 {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
    line-height: 1.25;
    color: var(--page-ink);
  }

  .optional {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--page-muted);
  }

  .body {
    margin: 14px 0 0;
    max-width: var(--page-measure);
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-medium);
    line-height: 1.65;
    color: var(--page-body);
    text-wrap: pretty;
  }

  .body strong {
    color: var(--page-ink);
  }

  /* Fine print sits beside its button rather than under it, so a step reads as
     one action with a caveat instead of a stack of blocks. Every step gets the
     same pairing — a step with a button and no caveat looked unfinished next to
     its neighbours. */
  .action {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 20px;
    margin-top: 18px;
  }

  .btn {
    display: inline-block;
    padding: 15px 24px;
    border-radius: var(--radius-md);
    background: var(--page-accent);
    color: var(--page-on-accent);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
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
    max-width: 34ch;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    line-height: 1.5;
    color: var(--page-muted);
  }

  /* Every step closes on a callout washed in its own crayon hue, so the four
     read as one system rather than as four notes on the same grey. The rail is
     the full hue; the fill is the same hue at wash strength. */
  .card {
    max-width: var(--page-measure);
    margin-top: 22px;
    padding: 14px 18px;
    border-left: 3px solid var(--card-accent);
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
    background: var(--step-wash);
  }

  .card-label {
    margin: 0 0 4px;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--step-ink);
  }

  .card-body {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    line-height: 1.6;
    color: var(--callout-ink);
  }

  .card-body strong {
    color: var(--page-ink);
  }

  a:not(.btn) {
    color: var(--page-link);
    text-underline-offset: 3px;
    text-decoration-thickness: 1px;
  }

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it stuck until the next tap elsewhere. */
  @media (hover: hover) {
    .btn:hover {
      background: var(--page-accent-hover);
    }

    a:not(.btn):hover {
      color: var(--page-link-hover);
    }
  }

  @media (max-width: 540px) {
    .steps {
      --step-gap: 38px;
      --num-size: 26px;
    }

    /* The gutter costs ~28px of an already tight measure, so the numeral drops
       out of it and sits inline with the title while the body and its callouts
       run the full sheet width. With no gutter there is nothing to rail. */
    .steps > li {
      padding-left: 0;
    }

    .steps > li:not(:last-child)::before {
      content: none;
    }

    .num {
      position: static;
      font-size: var(--font-size-xs);
    }

    h3 {
      font-size: var(--font-size-lg);
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
