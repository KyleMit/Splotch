<script lang="ts">
  // Friendly, plain-language privacy policy. The only automatic request is the
  // pseudonymous free-allowance check disclosed below; drawing content is sent
  // only when someone deliberately requests AI art or a grown-up reports it.
  // This page exists mostly to *prove* that. It's required by the app stores
  // (see the `mobile` skill's store-release checklist). Keep the tone simple
  // enough for a parent to skim in 30 seconds. Bump LAST_UPDATED whenever the
  // wording changes.

  import PageShell from '$lib/components/page/PageShell.svelte';
  import RuleLabel from '$lib/components/page/RuleLabel.svelte';
  import { paletteHex, type PaletteLabel } from '$lib/palette';
  // Splotch has no email; questions/concerns go through GitHub issues.
  import { GITHUB_NEW_ISSUE_URL as CONTACT_URL } from '$lib/githubRepo';

  const LAST_UPDATED = 'August 11, 2026';

  // The headline promises, each led by a crayon chip in the brand rainbow —
  // the same visual vocabulary as the masthead's CrayonStrip.
  const HIGHLIGHTS: { label: PaletteLabel; lead: string; body: string }[] = [
    { label: 'Red', lead: 'No ads.', body: 'Ever. None.' },
    { label: 'Orange', lead: 'No tracking.', body: "We don't follow you around the internet." },
    { label: 'Yellow', lead: 'No accounts.', body: 'No sign-up, no login, no passwords.' },
    { label: 'Green', lead: 'No analytics.', body: 'No third-party trackers or SDKs.' },
    {
      label: 'Blue',
      lead: 'No hidden collection.',
      body: 'We explain the small free-allowance check and every feature that sends content below.',
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

<PageShell title="Privacy policy" wordmark="Splotch">
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
    Ordinary drawing stays on your device. Splotch does not create a profile about you or your
    child, does not sell information, and does not show advertising of any kind. The optional
    internet features below send content only when you deliberately choose to send it.
  </p>

  <h3>When the internet is used</h3>
  <p>
    Splotch has an optional “magic image” button that re-imagines a child's drawing as a polished
    illustration. Each installation gets ten successful creations free, and the operation runs
    through the grown-up check configured in Parent Center. After the free creations are used, a
    grown-up can add a Gemini key in Settings. A drawing is sent only when someone taps the button.
  </p>
  <ul>
    <li>
      When tapped, the current drawing is sent to our image service (which uses Google's Gemini AI)
      to generate a new picture, which is sent right back.
    </li>
    <li>
      <strong>We don't keep the drawing or result from an ordinary magic-image request.</strong> They
      pass straight through our service on the way to Google and back, unless a grown-up separately confirms
      “Report this picture.”
    </li>
    <li>
      Google generates the picture on its own systems, under the
      <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noopener noreferrer">
        Gemini API terms</a
      >, which let it keep prompts and results for a limited time to check for abuse. That part is
      Google's, not ours.
    </li>
    <li>
      If you've added your <em>own</em> Gemini key in Settings, the drawing still passes through our
      service on the way to Google, along with your key — which we use for that one request and
      never store. It reaches Google under <em>your</em> account and the terms that apply to it, rather
      than ours. On a free Gemini key, those terms let Google use the content to improve its own products,
      so it's worth reading them before you add one.
    </li>
    <li>
      To enforce the ten free creations, the app sends a one-way, app-purpose installation code when
      it checks the remaining allowance and requests a free image. We store that code with counts,
      timestamps, and broad failure reasons. We never receive the underlying device ID, and the code
      is not combined with an account, advertising ID, hardware fingerprint, or location. Clearing
      browser data and some iOS uninstall sequences can create a new code.
    </li>
    <li>
      We keep a simple count of how often each access code is used, purely to prevent abuse — along
      with the date and which art style was picked. This isn't tied to a person, isn't used to
      identify anyone, and is deleted when the access code is retired.
    </li>
    <li>
      Drawings are not used to build profiles, are not sold, and are not used for advertising or
      tracking.
    </li>
    <li>
      If your device is offline, this button is hidden and the rest of the app works normally.
    </li>
  </ul>

  <h3>Reporting an AI-generated picture</h3>
  <p>
    Every finished magic image is labelled “AI-generated picture.” If one is inappropriate or
    otherwise wrong, a grown-up can choose “Report this picture,” review a confirmation, and send it
    for human review. Nothing is retained until that final confirmation.
  </p>
  <p>
    A confirmed picture report stores the drawing that was sent, the exact server-generated
    instruction used for the selected art style, the AI-generated picture, the selected style, and
    the report time. It goes into our private support system so we can investigate and respond
    within 24 hours. The report bundle is automatically deleted after
    <strong>30 days</strong> by a daily cleanup job. To ask us to delete one sooner, use the
    <a href="/feedback">private feedback form</a> and include the report reference shown after it was
    sent.
  </p>

  <h3>Sending feedback</h3>
  <p>
    Grown-ups can report a bug or suggest a feature from Settings. When you tap “Send report”, only
    what you type is sent to our <strong>private</strong> support tracker on GitHub. Please don't type
    personal details (like a name or email address) into a report — the form reminds you of this too.
  </p>
  <p>
    For a bug, you can <em>optionally</em> tick a box to include basic device details (like your app version,
    operating system, browser, and screen size) to help us reproduce the problem. It's off by default,
    you can expand it to see exactly what will be sent first, and some of those details (such as your
    browser's user-agent) can be somewhat identifying — so it's entirely your choice. We never include
    your name, account, or location, because Splotch doesn't have any of those.
  </p>

  <h3>Saving pictures</h3>
  <p>
    When you save a drawing, it's stored <strong>locally</strong> in your device's own photo gallery.
    Splotch never uploads your saved photos anywhere.
  </p>

  <h3>Settings on your device</h3>
  <p>
    Splotch remembers small preferences (like sound on/off and your last color or brush size) using
    your device's local storage. Those preferences stay on your device and are never sent to us. On
    the web, a random local installation value is used only to create the one-way free-allowance
    code described above.
  </p>

  <h3>Children's privacy</h3>
  <p>
    Splotch is designed for young children. It has no accounts, ads, tracking, or analytics, and has
    no advertising or analytics SDKs. When the app opens online, it checks the free allowance using
    the one-way installation code described above; it does not send drawing content during that
    check. Sending feedback and reporting an AI-generated picture each has its own grown-up-check
    policy in Parent Center. The App Store and Google Play versions ask every time to begin with; on
    the web those checks start off, and you turn on the ones you want. Splotch does not ask for a
    child's name, email address, account, or location, and the submitted content is not used to
    identify a child. We handle these deliberate flows in line with children's privacy laws,
    including COPPA and the GDPR's protections for children. There are no social features, comments,
    chat, advertising, or in-app purchases.
  </p>

  <h3>Changes to this policy</h3>
  <p>
    If we ever change this policy, we'll update the date at the top of this page. We'll keep it just
    as plain and honest as it is today.
  </p>

  <h3>Contact</h3>
  <p>
    Questions or concerns? Please
    <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer">open an issue on GitHub</a>
    and we'll take a look.
  </p>
</PageShell>

<style>
  /* Everything colored here reads PageShell's --page-* palette or a themed app
     token, so the policy follows the parent's night-mode preference like every
     other page. Theme-invariant tokens (--font-size-*, --font-weight-*,
     --radius-*) are used directly. */

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
     fills the sheet. The brand washes are the panel's tint on either paper:
     lavender over the white sheet, a plum-tinted edge over the dark one. */
  .highlights {
    list-style: none;
    max-width: none;
    padding: var(--space-1) 22px;
    margin: 0 0 var(--space-8);
    border: 2px solid var(--brand-wash-hover);
    border-radius: var(--radius-lg);
  }

  .highlights li {
    display: flex;
    gap: 14px;
    align-items: baseline;
    padding: 13px 0;
    margin: 0;
    border-bottom: var(--border-width) solid var(--brand-wash);
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
     keep it stuck until the next tap elsewhere. The underline thickens rather
     than the color deepening — the themed link ramp has no deeper step. */
  @media (hover: hover) {
    a:hover {
      text-decoration-thickness: 2px;
    }
  }
</style>
