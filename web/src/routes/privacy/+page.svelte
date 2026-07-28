<script lang="ts">
  // Friendly, plain-language privacy policy. Splotch collects nothing
  // automatically — the only data it ever receives is what a grown-up
  // deliberately turns on or sends: a magic-image request (see "When the
  // internet is used") or the optional feedback form (see "Sending feedback").
  // This page exists mostly to *prove* that. It's required by the app stores
  // (see MOBILE.md). Keep the tone simple enough for a parent to skim in 30
  // seconds. Bump LAST_UPDATED whenever the wording changes.

  const LAST_UPDATED = 'July 28, 2026';
  // Splotch has no email; questions/concerns go through GitHub issues.
  const CONTACT_URL = 'https://github.com/KyleMit/Splotch/issues/new/choose';
</script>

<svelte:head>
  <title>Privacy Policy · Splotch</title>
  <meta
    name="description"
    content="Splotch's privacy policy: no ads, no tracking, no accounts, and no analytics."
  />
</svelte:head>

<main class="legal">
  <div class="sheet">
    <a class="back" href="/">← Back to drawing</a>

    <h1>Privacy Policy <span aria-hidden="true">🎨</span></h1>
    <p class="updated">Last updated: {LAST_UPDATED}</p>

    <p class="intro">
      Splotch is a drawing app made for little kids. We built it to be safe and simple, so the short
      version is easy to remember:
    </p>

    <ul class="highlights">
      <li><strong>🚫 No ads.</strong> Ever. None.</li>
      <li><strong>🙈 No tracking.</strong> We don't follow you around the internet.</li>
      <li><strong>👤 No accounts.</strong> No sign-up, no login, no passwords.</li>
      <li><strong>📊 No analytics.</strong> No third-party trackers or SDKs.</li>
      <li>
        <strong>🗂️ No background collection.</strong> The only info we ever receive is what a grown-up
        turns on or sends us — a magic-image request, or a bug report.
      </li>
      <li><strong>✈️ Works offline.</strong> Drawing happens entirely on your device.</li>
    </ul>

    <h2>The simple truth</h2>
    <p>
      Everything you draw stays on your device. Splotch does not create a profile about you or your
      child, does not sell or share any information, and does not show advertising of any kind.
    </p>

    <h2>When the internet is used</h2>
    <p>
      Splotch has an optional “magic image” button that re-imagines a child's drawing as a polished
      illustration. A grown-up has to switch it on first — the button stays hidden until an access
      code or Gemini key is entered in the Parent Center — and it only ever runs when someone taps
      it.
    </p>
    <ul>
      <li>
        When tapped, the current drawing is sent to our image service (which uses Google's Gemini
        AI) to generate a new picture, which is sent right back.
      </li>
      <li>
        <strong>We don't keep the drawing.</strong> It passes straight through our service on its way
        to Google and back. Neither the drawing your child sent nor the picture that comes back is saved
        on our servers.
      </li>
      <li>
        Google generates the picture on its own systems, under the
        <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">
          Gemini API terms</a
        >, which let it keep prompts and results for a limited time to check for abuse. That part is
        Google's, not ours.
      </li>
      <li>
        If you've added your <em>own</em> Gemini key in the Parent Center, the drawing still passes
        through our service on the way to Google, along with your key — which we use for that one
        request and never store. It reaches Google under <em>your</em> account and the terms that apply
        to it, rather than ours. On a free Gemini key, those terms let Google use the content to improve
        its own products, so it's worth reading them before you add one.
      </li>
      <li>
        We keep a simple count of how often each access code is used, purely to prevent abuse —
        along with the date and which art style was picked. This isn't tied to a person, isn't used
        to identify anyone, and is deleted when the access code is retired.
      </li>
      <li>
        Drawings are not used to build profiles, are not sold, and are not used for advertising or
        tracking.
      </li>
      <li>
        If your device is offline, this button is hidden and the rest of the app works normally.
      </li>
    </ul>

    <h2>Sending feedback</h2>
    <p>
      Grown-ups can report a bug or suggest a feature from the Parent Center. When you tap “Send
      report”, only what you type is sent, so we can post it as an issue on our
      <strong>public</strong> issue tracker on GitHub, where anyone can read it. Please don't type personal
      details (like a name or email address) into a report — the form reminds you of this too.
    </p>
    <p>
      For a bug, you can <em>optionally</em> tick a box to include basic device details (like your app
      version, operating system, browser, and screen size) to help us reproduce the problem. It's off
      by default, you can expand it to see exactly what will be sent first, and some of those details
      (such as your browser's user-agent) can be somewhat identifying — so it's entirely your choice.
      We never include your name, account, or location, because Splotch doesn't have any of those.
    </p>

    <h2>Saving pictures</h2>
    <p>
      When you save a drawing, it's stored <strong>locally</strong> in your device's own photo gallery.
      Splotch never uploads your saved photos anywhere.
    </p>

    <h2>Settings on your device</h2>
    <p>
      Splotch remembers small preferences (like sound on/off and your last color or brush size)
      using your device's local storage. This stays on your device and is never sent to us.
    </p>

    <h2>Children's privacy</h2>
    <p>
      Splotch is designed for young children. It has no accounts, ads, tracking, or analytics, and
      gathers nothing on its own. The one place any information is sent is the grown-ups' feedback
      form above, which a child can't reach — so we collect no personal information from children,
      and we comply with children's privacy laws such as the Children's Online Privacy Protection
      Act (COPPA) and the GDPR's protections for children. There are no social features, comments,
      links out, or in-app purchases.
    </p>

    <h2>Changes to this policy</h2>
    <p>
      If we ever change this policy, we'll update the date at the top of this page. We'll keep it
      just as plain and honest as it is today.
    </p>

    <h2>Contact</h2>
    <p>
      Questions or concerns? Please
      <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">open an issue on GitHub</a>
      and we'll take a look.
    </p>
  </div>
</main>

<style>
  /* This page is deliberately light-only, like /admin: the themed color tokens
     flip with data-theme / prefers-color-scheme (tokens.css sets them on
     :root, which reaches this route too), so adopting them would
     half-dark-theme legal copy whose links are contrast-pinned to a light
     background. So the colors are declared once below as a local palette
     instead of scattered literals. Each value is the page's own — hoisting
     them changed no pixels — with a comment naming the light-theme token it
     approximates, for whoever revisits the pinning. The one real token this
     page uses is --brand (h1), which is exempt because it is theme-invariant:
     tokens.css defines it once and never redefines it in a dark block. */

  /* A full-viewport scroll panel with its own light background. The legal copy is
     a normal scrollable, selectable, zoomable document — the drawing-route
     app-surface locks (app.css) don't reach this route, so no opt-out is needed. */
  .legal {
    --legal-bg: #f5f5f5; /* = --app-bg, light */
    --legal-sheet: #ffffff; /* = --surface, light */
    --legal-text: #2b2b33; /* ~ --text-strong (#333), light */
    --legal-text-muted: #6c6c76; /* ~ --text-mid (#666), light */
    --legal-heading: #6b3fa0; /* ~ --brand-text (#7c50bb), light */
    --legal-card: #f7f2fd; /* ~ --brand-wash (#ede7f6), light */
    /* No token; paired with --legal-card, which it has to outline visibly. */
    --legal-card-border: #eadcfa;
    /* Darker than --brand, whose 3.4:1 fails WCAG AA for body-size text (axe
       serious); this clears 4.5:1 on the sheet. */
    --legal-link: #7c4dcf;

    position: fixed;
    inset: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    background: var(--legal-bg);
    padding: 24px 16px 64px;
    color: var(--legal-text);
    line-height: 1.6;
  }

  .sheet {
    max-width: 680px;
    margin: 0 auto;
    background: var(--legal-sheet);
    border-radius: 20px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.08);
    padding: 32px clamp(20px, 5vw, 44px) 40px;
  }

  .back {
    display: inline-block;
    margin-bottom: 20px;
    color: var(--legal-link);
    text-decoration: none;
    font-weight: 600;
  }

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it stuck until the next tap elsewhere. */
  @media (hover: hover) {
    .back:hover {
      text-decoration: underline;
    }
  }

  h1 {
    font-size: clamp(1.8rem, 5vw, 2.4rem);
    color: var(--brand);
    margin-bottom: 4px;
  }

  .updated {
    color: var(--legal-text-muted);
    font-size: 0.9rem;
    margin-bottom: 24px;
  }

  .intro {
    font-size: 1.1rem;
    margin-bottom: 20px;
  }

  h2 {
    font-size: 1.25rem;
    color: var(--legal-heading);
    margin: 28px 0 8px;
  }

  p {
    margin-bottom: 12px;
  }

  ul {
    margin: 0 0 12px;
    padding-left: 1.2em;
  }

  li {
    margin-bottom: 8px;
  }

  /* The headline "no ___" promises, as a friendly card list. */
  .highlights {
    list-style: none;
    padding: 0;
    margin: 0 0 8px;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px;
  }

  .highlights li {
    background: var(--legal-card);
    border: 2px solid var(--legal-card-border);
    border-radius: 14px;
    padding: 12px 14px;
    margin: 0;
  }

  a {
    color: var(--legal-link);
  }
</style>
