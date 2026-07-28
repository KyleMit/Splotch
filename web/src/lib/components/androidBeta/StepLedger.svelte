<script lang="ts">
  import {
    BETA_OPT_IN_URL,
    MIN_ANDROID_API_LEVEL,
    MIN_ANDROID_RELEASE,
    PLAY_STORE_LISTING_URL,
    TESTERS_GROUP_SUBSCRIBE_EMAIL,
    TESTERS_GROUP_URL,
  } from '$lib/androidBeta';

  // The three sign-up steps of /android-beta. Each leads with the one route
  // that works for a reader who has done nothing yet: the group's own web page
  // refuses most first-time testers, and the Play listing is dark until they
  // have opted in, so the mailto and the tester page take the buttons.
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
          first. The quickest way in is a blank email — the group writes back, you reply, and you're
          a member.
        </p>
        <div class="action-row">
          <a class="btn" href="mailto:{TESTERS_GROUP_SUBSCRIBE_EMAIL}">Email to join</a>
          <span class="beside">
            or <a href={TESTERS_GROUP_URL} target="_blank" rel="noopener noreferrer">
              open the group on Google Groups</a
            >
          </span>
        </div>
        <p class="hint">
          Send it blank — no subject, no message. An automated reply usually lands within a minute
          (check spam if it doesn't); reply to it, blank again, and you're in. The web route may ask
          you to sign in or request access first.
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
          Open the tester page and press <strong>Become a tester</strong>. When it works, the page
          switches to “You're a tester” and offers a download link.
        </p>
        <p class="action-row">
          <a class="btn" href={BETA_OPT_IN_URL} target="_blank" rel="noopener noreferrer">
            Become a tester
          </a>
        </p>
        <p class="hint">
          Works in any browser, phone or computer — just make sure it's signed in to the account
          from step 1. This enrols you; it doesn't install anything yet. Once you're in, this same
          page grows a “Download it on Google Play” link — that's step 3.
        </p>
      </div>
    </li>

    <li>
      <span class="num">3</span>
      <div>
        <h3>Install Splotch</h3>
        <p class="step-body">
          The store listing stays hidden until step 2 is done — before that it just says “item not
          found”. Now it opens normally and installs like any other app, and updates arrive
          automatically as new beta builds go out.
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
      </div>
    </li>
  </ol>

  <div class="note stay">
    <p class="note-label">Please stay for 14 days</p>
    <p class="note-body">
      Once you're in, <strong>stay opted in for at least 14 days in a row</strong>, even if you've
      seen everything you wanted to in the first ten minutes. Google requires a stretch of
      continuously enrolled testers before Splotch can apply for a public listing, so leaving early
      — or opting out and back in — sets that clock back for everyone. You don't have to keep
      drawing; just stay enrolled.
    </p>
  </div>
</div>

<style>
  .ledger {
    padding: 36px var(--beta-gutter) 44px;
  }

  .ledger-intro {
    margin: 6px 0 0;
    font-size: 15px;
    color: var(--beta-muted);
    max-width: 60ch;
  }

  .section-label {
    margin: 0 0 4px;
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--beta-label);
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

  /* The button and its inline alternative share a line where there's room, so a
     step never reads as two competing blocks. */
  .action-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 18px;
    margin: 0;
  }

  .beside {
    font-size: 14px;
    color: var(--beta-muted);
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

  .stay {
    margin-top: 32px;
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
</style>
