<script lang="ts">
  // Friendly, plain-language privacy policy. Splotch collects nothing
  // automatically — the only data it ever receives is what a grown-up
  // deliberately turns on or sends: a magic-image request (see "When the
  // internet is used") or the optional feedback form (see "Sending feedback").
  // This page exists mostly to *prove* that. It's required by the app stores
  // (see the `mobile` skill's store-release checklist). Keep the tone simple
  // enough for a parent to skim in 30 seconds. Bump LAST_UPDATED whenever the
  // wording changes.

  import PageShell from '$lib/components/page/PageShell.svelte';
  import RuleLabel from '$lib/components/page/RuleLabel.svelte';
  import { paletteHex, type PaletteLabel } from '$lib/palette';
  // Splotch has no email; questions/concerns go through GitHub issues.
  import { GITHUB_NEW_ISSUE_URL as CONTACT_URL } from '$lib/githubRepo';

  const LAST_UPDATED = 'July 28, 2026';

  // The headline promises, each led by a crayon chip in the brand rainbow —
  // the same visual vocabulary as the masthead's CrayonStrip.
  const HIGHLIGHTS: { label: PaletteLabel; lead: string; body: string }[] = [
    { label: 'Red', lead: 'No ads.', body: 'Ever. None.' },
    { label: 'Orange', lead: 'No tracking.', body: "We don't follow you around the internet." },
    { label: 'Yellow', lead: 'No accounts.', body: 'No sign-up, no login, no passwords.' },
    { label: 'Green', lead: 'No analytics.', body: 'No third-party trackers or SDKs.' },
    {
      label: 'Blue',
      lead: 'No background collection.',
      body: 'The only info we ever receive is what a grown-up turns on or sends us — a magic-image request, or a bug report.',
    },
    { label: 'Purple', lead: 'Works offline.', body: 'Drawing happens entirely on your device.' },
  ];
</script>

<svelte:head>
  <title>Privacy Policy · Splotch</title>
  <meta
    name="description"
    content="Splotch's privacy policy: no ads, no tracking, no accounts, and no analytics."
  />
</svelte:head>

<div class="privacy">
  <PageShell class="privacy-palette" title="Privacy policy" wordmark="Splotch">
    {#snippet lede()}
      Splotch is a drawing app made for little kids. We built it to be safe and simple, so the short
      version is easy to remember.
    {/snippet}

    <!-- RuleLabel's hairline is terminal (::after), so this variant with the
         date sitting flush right after the rule is inlined here instead. -->
    <h2 class="short-version">
      <span>The short version</span>
      <span class="rule" aria-hidden="true"></span>
      <span class="updated">Last updated {LAST_UPDATED}</span>
    </h2>

    <ul class="highlights">
      {#each HIGHLIGHTS as { label, lead, body } (label)}
        <li>
          <span class="chip" aria-hidden="true" style:background={paletteHex(label)}></span>
          <span><strong>{lead}</strong> {body}</span>
        </li>
      {/each}
    </ul>

    <RuleLabel>The details</RuleLabel>

    <h3>The simple truth</h3>
    <p>
      Everything you draw stays on your device. Splotch does not create a profile about you or your
      child, does not sell or share any information, and does not show advertising of any kind.
    </p>

    <h3>When the internet is used</h3>
    <p>
      Splotch has an optional “magic image” button that re-imagines a child's drawing as a polished
      illustration. A grown-up has to switch it on first — the button stays hidden until an access
      code or Gemini key is entered in Settings — and it only ever runs when someone taps it.
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
        If you've added your <em>own</em> Gemini key in Settings, the drawing still passes through
        our service on the way to Google, along with your key — which we use for that one request
        and never store. It reaches Google under <em>your</em> account and the terms that apply to it,
        rather than ours. On a free Gemini key, those terms let Google use the content to improve its
        own products, so it's worth reading them before you add one.
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

    <h3>Sending feedback</h3>
    <p>
      Grown-ups can report a bug or suggest a feature from Settings. When you tap “Send report”,
      only what you type is sent, so we can post it as an issue on our
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

    <h3>Saving pictures</h3>
    <p>
      When you save a drawing, it's stored <strong>locally</strong> in your device's own photo gallery.
      Splotch never uploads your saved photos anywhere.
    </p>

    <h3>Settings on your device</h3>
    <p>
      Splotch remembers small preferences (like sound on/off and your last color or brush size)
      using your device's local storage. This stays on your device and is never sent to us.
    </p>

    <h3>Children's privacy</h3>
    <p>
      Splotch is designed for young children. It has no accounts, ads, tracking, or analytics, and
      gathers nothing on its own. The one place any information is sent is the grown-ups' feedback
      form above, which a child can't reach — so we collect no personal information from children,
      and we comply with children's privacy laws such as the Children's Online Privacy Protection
      Act (COPPA) and the GDPR's protections for children. There are no social features, comments,
      links out, or in-app purchases.
    </p>

    <h3>Changes to this policy</h3>
    <p>
      If we ever change this policy, we'll update the date at the top of this page. We'll keep it
      just as plain and honest as it is today.
    </p>

    <h3>Contact</h3>
    <p>
      Questions or concerns? Please
      <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">open an issue on GitHub</a>
      and we'll take a look.
    </p>
  </PageShell>
</div>

<style>
  /* Deliberately light-only, like /android-beta and /admin: the themed color
     tokens flip with data-theme / prefers-color-scheme (tokens.css sets them on
     :root, which reaches this route too), so adopting them would
     half-dark-theme legal copy whose link contrast is pinned to a light ground.
     PageShell defaults its --page-* palette to those themed tokens, so this
     route pins every one of them — the same values /android-beta pins, so the
     standalone parent pages share one look. Theme-invariant tokens
     (--font-size-*, --font-weight-*, --radius-*) are used directly.

     The overrides land on PageShell's own root via the forwarded class, which
     is the only element they can sit on: a custom property declared on a
     wrapper would otherwise lose to the same property set on .page itself. */
  .privacy :global(.privacy-palette) {
    --page-ground: #f0efed; /* ~ --app-bg (#f5f5f5), warmed */
    --page-sheet: #ffffff; /* = --surface, light */
    --page-ink: #26262e; /* ~ --text-strong (#333), light */
    --page-body: #55555f; /* ~ --text (#555), light */
    --page-muted: #6c6c76; /* ~ --text-soft (#666), light */
    --page-rule: #eeeae4; /* ~ --border-warm (#ddd6cc), lightened */
    /* Darker than --brand, whose 3.4:1 fails WCAG AA for body-size text; this
       clears 4.5:1 on the sheet. Same value /android-beta pins. */
    --page-link: #7c4dcf;
    --page-link-hover: #6b3fbf;
    /* Unused on this page (no accent-filled control), pinned anyway so the
       palette stays complete and copy-safe for the next section added here. */
    --page-accent: #7c4dcf;
    --page-accent-hover: #6b3fbf;
    --page-on-accent: #ffffff;
    /* The sheet's lift, pinned for the same reason: --float-shadow's dark value
       is a light keyline that would show as a halo on this white sheet. */
    --page-shadow: 0 1px 2px rgba(93, 84, 68, 0.05), 0 10px 30px rgba(93, 84, 68, 0.07);
  }

  /* The highlight panel's brand-tinted strokes, pinned like the palette above
     (~ --brand-wash light; neither has a token equivalent). */
  .privacy {
    --privacy-card-border: #eadcfa;
    --privacy-row-rule: #f3eefb;
  }

  /* RuleLabel's look with the last-updated date flush right after the hairline.
     flex-wrap lets the date drop under the rule rather than squeeze the label;
     the rule's min-width forces that wrap before the date crowds in. */
  .short-version {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 14px;
    margin: 0;
    padding-bottom: 22px;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--page-muted);
  }

  .short-version .rule {
    flex: 1;
    min-width: var(--space-8);
    height: var(--border-width);
    background: var(--page-rule);
  }

  .short-version .updated {
    text-transform: none;
    font-weight: var(--font-weight-medium);
    letter-spacing: 0.06em;
    white-space: nowrap;
  }

  /* The headline "no ___" promises, as a bordered checklist whose rows lead
     with crayon chips — the one block that escapes the reading measure and
     fills the sheet. */
  .highlights {
    list-style: none;
    max-width: none;
    padding: var(--space-1) 22px;
    margin: 0 0 var(--space-8);
    border: 2px solid var(--privacy-card-border);
    border-radius: var(--radius-lg);
  }

  .highlights li {
    display: flex;
    gap: 14px;
    align-items: baseline;
    padding: 13px 0;
    margin: 0;
    border-bottom: var(--border-width) solid var(--privacy-row-rule);
    color: var(--page-body);
  }

  .highlights li:last-child {
    border-bottom: none;
  }

  /* Matches the masthead CrayonStrip's pill proportions, sized up a touch; the
     translate optically centers the chip against the first line's baseline. */
  .highlights .chip {
    flex: 0 0 auto;
    width: 18px;
    height: 8px;
    border-radius: var(--radius-pill);
    transform: translateY(-2px);
  }

  .highlights strong {
    color: var(--page-ink);
  }

  h3 {
    margin: 28px 0 6px;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: var(--page-ink);
  }

  p,
  ul {
    max-width: var(--page-measure);
    margin: 0 0 12px;
    color: var(--page-body);
  }

  ul {
    padding-left: 1.2em;
  }

  li {
    margin-bottom: 8px;
  }

  a {
    color: var(--page-link);
    text-underline-offset: 3px;
    text-decoration-thickness: 1px;
  }

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it stuck until the next tap elsewhere. */
  @media (hover: hover) {
    a:hover {
      color: var(--page-link-hover);
    }
  }
</style>
