<script lang="ts">
  // Friendly, plain-language privacy policy. Splotch collects nothing
  // automatically — the only data it ever receives is what a grown-up
  // deliberately types into the optional feedback form (see "Sending feedback"),
  // and this page exists mostly to *prove* that. It's required by the app stores
  // (see MOBILE.md). Keep the tone simple enough for a parent to skim in 30
  // seconds. Bump EFFECTIVE_DATE whenever the wording changes.

  const EFFECTIVE_DATE = 'July 16, 2026';
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
    <p class="updated">Last updated: {EFFECTIVE_DATE}</p>

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
        chooses to send us (like a bug report).
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
      illustration. It only runs when someone taps it.
    </p>
    <ul>
      <li>
        When tapped, the current drawing is sent to our image service (which uses Google's Gemini
        AI) to generate a new picture, which is sent right back.
      </li>
      <li>
        We keep a simple count of how often each invite code is used, purely to prevent abuse. This
        isn't tied to a person and isn't used to identify anyone.
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
  /* The global body disables scrolling and text selection for the drawing
     canvas, so this page opts back into both with its own scroll container. */
  .legal {
    position: fixed;
    inset: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    touch-action: auto;
    user-select: text;
    -webkit-user-select: text;
    background: #f5f5f5;
    padding: 24px 16px 64px;
    color: #2b2b33;
    line-height: 1.6;
  }

  .sheet {
    max-width: 680px;
    margin: 0 auto;
    background: white;
    border-radius: 20px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.08);
    padding: 32px clamp(20px, 5vw, 44px) 40px;
  }

  .back {
    display: inline-block;
    margin-bottom: 20px;
    color: var(--brand);
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
    color: #8a8a94;
    font-size: 0.9rem;
    margin-bottom: 24px;
  }

  .intro {
    font-size: 1.1rem;
    margin-bottom: 20px;
  }

  h2 {
    font-size: 1.25rem;
    color: #6b3fa0;
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
    background: #f7f2fd;
    border: 2px solid #eadcfa;
    border-radius: 14px;
    padding: 12px 14px;
    margin: 0;
  }

  a {
    color: var(--brand);
  }
</style>
