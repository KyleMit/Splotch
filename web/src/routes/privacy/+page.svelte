<script lang="ts">
  // Friendly, plain-language privacy policy. Drawing content is sent only when
  // someone deliberately requests AI art or a grown-up reports it; the few
  // automatic network requests are named below. This page is required by the
  // app stores (see the `mobile` skill's store-release checklist). Keep the tone
  // simple enough for a parent to skim quickly. Bump LAST_UPDATED whenever the
  // wording changes.

  import { onMount, type Component } from 'svelte';
  import PageShell from '$lib/components/page/PageShell.svelte';
  import RuleLabel from '$lib/components/page/RuleLabel.svelte';
  import { parentalGateLink } from '$lib/actions/parentalGateLink';
  import { GENERATION_JOB_TTL_MS } from '$lib/ai/limits';
  import { FREE_GENERATION_LIMIT } from '$lib/freeGenerations';
  import { scheduleIdle } from '$lib/idle';
  import { IMAGE_REPORT_RETENTION_DAYS } from '$lib/imageReport';
  import { paletteHex, type PaletteLabel } from '$lib/palette';
  import { createSingleFlight } from '$lib/singleFlight';
  import { FEEDBACK_URL } from '$lib/siteUrl';
  import type { Origin } from '$lib/state/modal.svelte';
  import { openParentCenterSettings, settingsModal } from '$lib/state/ui.svelte';

  const LAST_UPDATED = 'August 17, 2026';
  const GENERATION_JOB_TTL_MINUTES = GENERATION_JOB_TTL_MS / 60_000;

  // The headline promises, each led by a crayon chip in the brand rainbow —
  // the same visual vocabulary as the masthead's CrayonStrip.
  const HIGHLIGHTS: { label: PaletteLabel; lead: string; body: string }[] = [
    { label: 'Red', lead: 'No ads.', body: 'Ever. None.' },
    { label: 'Orange', lead: 'No tracking.', body: "We don't follow you around the internet." },
    { label: 'Yellow', lead: 'No accounts.', body: 'No sign-up, no login, no passwords.' },
    {
      label: 'Green',
      lead: 'No analytics.',
      body: 'No advertising, analytics, or tracking SDKs.',
    },
    {
      label: 'Blue',
      lead: 'No hidden collection.',
      body: 'We explain the small free-allowance check and every feature that sends content below.',
    },
    { label: 'Purple', lead: 'Works offline.', body: 'Drawing happens entirely on your device.' },
  ];

  let managingPolicies = $state(false);
  let ParentalGate = $state<Component | null>(null);
  let SettingsModal = $state<Component | null>(null);
  let refreshFreeGenerationGrant = $state<(() => void) | null>(null);

  const loadParentalGate = createSingleFlight(
    async () => (await import('$lib/components/ParentalGate.svelte')).default
  );

  const loadSettingsModal = createSingleFlight(async () => {
    const [module, { hydratePersistedState }, grants] = await Promise.all([
      import('$lib/components/SettingsModal.svelte'),
      import('$lib/boot/persistedState'),
      import('$lib/state/freeGenerations.svelte'),
    ]);
    await hydratePersistedState();
    refreshFreeGenerationGrant ??= grants.createFreeGenerationGrantRefresher();
    return module.default;
  });

  function mountParentalGate() {
    void loadParentalGate()
      .then((component) => (ParentalGate = component))
      .catch((error) => console.error('Privacy parental gate failed to load:', error));
  }

  function privacyParentalGateLink(node: HTMLAnchorElement) {
    node.addEventListener('click', mountParentalGate);
    const gateLink = parentalGateLink(node);
    return {
      destroy() {
        node.removeEventListener('click', mountParentalGate);
        gateLink.destroy();
      },
    };
  }

  function openPrivacyParentCenter(origin: Origin | null) {
    managingPolicies = true;
    openParentCenterSettings(origin);
    void loadSettingsModal()
      .then((component) => (SettingsModal = component))
      .catch((error) => {
        settingsModal.hide();
        managingPolicies = false;
        console.error('Privacy Parent Center failed to load:', error);
      });
  }

  $effect(() => {
    if (managingPolicies && !settingsModal.open) managingPolicies = false;
  });

  $effect(() => {
    refreshFreeGenerationGrant?.();
  });

  onMount(() => scheduleIdle(mountParentalGate));
</script>

<svelte:head>
  <title>Privacy Policy · Splotch</title>
  <meta
    name="description"
    content="Splotch's privacy policy: no ads, no tracking, no accounts, and no analytics."
  />
</svelte:head>

{#snippet feedbackLink()}
  {#if __IS_CAPACITOR__}
    <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" use:privacyParentalGateLink
      >private feedback form</a
    >
  {:else}
    <a href="/feedback">private feedback form</a>
  {/if}
{/snippet}

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
    features below explain every time drawing or feedback content leaves your device, plus the few
    automatic requests that do not contain a drawing.
  </p>

  <h3>When the internet is used</h3>
  <p>
    Splotch has an optional “magic image” button that re-imagines a child's drawing as a polished
    illustration. The button is available by default while the free service is available, and it can
    be switched off in Settings. Each installation can receive up to {FREE_GENERATION_LIMIT}
    successful creations through a server-authoritative allowance. The operation follows the grown-up-check
    policy configured in Parent Center. After the free creations are used, a grown-up can add an access
    code or their own OpenAI key in Settings. A drawing is sent only when someone taps the button.
  </p>
  <ul>
    <li>
      When tapped, the current drawing is sent to our image service (which uses OpenAI) to generate
      a new picture, which is sent right back.
    </li>
    <li>
      <strong>We don't retain the drawing or result after an ordinary magic-image job ends.</strong>
      Our service briefly stores the drawing while handing it to the generation worker, then stores the
      finished picture until the app collects it. Collected jobs are deleted immediately. An uncollected
      job expires after {GENERATION_JOB_TTL_MINUTES} minutes, and an hourly cleanup removes its remaining
      files. Longer retention happens only if a grown-up separately confirms “Report this picture” or
      “Report this refusal.”
    </li>
    <li>
      OpenAI generates the picture on its own systems, under the
      <a
        href="https://openai.com/policies/services-agreement/"
        target="_blank"
        rel="noopener noreferrer"
        use:privacyParentalGateLink
      >
        OpenAI Services Agreement</a
      >. Two things about that are worth knowing, because they are not the same thing:
      <strong
        >OpenAI does not use what is sent through its API to train its models, unless the account
        holder opts in to sharing</strong
      >, and it does keep a copy to check for abuse. That copy is normally retained for up to 30
      days, but OpenAI's
      <a
        href="https://developers.openai.com/api/docs/guides/your-data"
        target="_blank"
        rel="noopener noreferrer"
        use:privacyParentalGateLink
      >
        published policy</a
      > allows it to keep one longer where the law requires it or where it is needed to stop harm, and
      a picture its scanner flags as possible child sexual abuse material is kept for a person to review
      whatever the account's settings say. That retention is OpenAI's, not ours. We also ask OpenAI not
      to store the API response as application state, which is the one part of its retention we control.
    </li>
    <li>
      If you've added your <em>own</em> OpenAI key in Settings, the app keeps it locally: in the
      Keychain or secure storage in the native apps, and encrypted in the browser's IndexedDB on the
      web. The drawing still passes through our service on the way to OpenAI, along with your key —
      which our service uses for that request and never stores. It reaches OpenAI under
      <em>your</em>
      account and the terms that apply to it, rather than ours. That includes the training setting on
      your account: if you have opted in to sharing, it is your child's drawing that is shared, so it's
      worth checking before you add a key.
    </li>
    <li>
      To enforce the {FREE_GENERATION_LIMIT} free creations, the app sends a one-way, app-purpose installation
      code when it checks the remaining allowance and requests a free image. Native apps hash the platform-provided
      app or vendor identifier; the web hashes a random value created and kept in that browser. We store
      only the resulting code with attempt and success counts, timestamps, short-lived reservations, and
      broad failure reasons. A separate anonymous daily total caps project-funded requests. We never receive
      the underlying identifier, and the code is not combined with an account, advertising ID, hardware
      fingerprint, or location. Clearing browser data and some iOS uninstall sequences can create a new
      code.
    </li>
    <li>
      For an access code, we keep an abuse-prevention tally with its count, first and latest use,
      latest art style, and latest server-written image instruction. That tally is deleted when the
      access code is retired. Access-code and own-key requests also write an operational server log
      with the date, credential category, art style, and server-written instruction — never the
      drawing or full key. These records are not used for advertising, tracking, or product
      analytics.
    </li>
    <li>
      Drawings are not used to build profiles, are not sold, and are not used for advertising or
      tracking.
    </li>
    <li>
      If your device is offline, this button is hidden and the rest of the app works normally.
    </li>
  </ul>

  <h3>Hosting, downloads, and security</h3>
  <p>
    Splotch's website, API, temporary generation jobs, and retained report evidence are hosted by
    Netlify. Like any internet host, it receives normal request details such as an IP address and
    browser information. Our API uses an address in short-lived memory to slow abuse; Splotch does
    not add it to the allowance records or use it to follow a person or device.
  </p>
  <ul>
    <li>
      When coloring books are enabled, Splotch may automatically download additional packs from our
      site. Those requests contain public file paths and normal request details, not a drawing,
      name, account, or location.
    </li>
    <li>
      On the web, a browser may automatically send our first-party security endpoint a report when
      the site's content-security policy blocks something. It can include the page and
      blocked-resource URLs, the rule that fired, and source location. We write it to the Netlify
      function log to diagnose a broken security policy; there is no third-party error-reporting
      service.
    </li>
    <li>
      Links that leave Splotch open the named destination, such as OpenAI's policy or key page and
      the project's GitHub page. They are not opened automatically. In the store apps, they follow
      the external-links grown-up-check policy described below.
    </li>
  </ul>

  <h3>Reporting an AI picture or refusal</h3>
  <p>
    Every finished magic image is labelled “AI-generated picture.” If one is inappropriate or
    otherwise wrong, a grown-up can choose “Report this picture,” review a confirmation, and send it
    for human review. Nothing is retained until that final confirmation.
  </p>
  <p>
    If the AI refuses a harmless drawing for safety, a grown-up can instead choose “Report this
    refusal.” Its confirmation sends the rejected drawing, exact server-generated instruction,
    selected art style, the AI provider's refusal reason, and report time. It does not include a
    generated picture because none was made. A refusal stays ephemeral unless a grown-up confirms
    this report.
  </p>
  <p>
    A confirmed picture report stores the drawing, exact server-generated instruction, selected art
    style, report time, and AI-generated picture. The evidence is stored privately on Splotch's
    Netlify account. A private GitHub support issue tells the maintainer where to find it and
    includes report metadata, but not the image files. We investigate and respond within 24 hours.
    The report bundle is scheduled for deletion after <strong
      >{IMAGE_REPORT_RETENTION_DAYS} days</strong
    >
    by a daily cleanup job. To ask us to delete one sooner, use the {@render feedbackLink()} and include
    the report reference shown after it was sent.
  </p>

  <h3>Sending feedback</h3>
  <p>
    Grown-ups can report a bug or suggest a feature from Settings. When you tap “Send report”, only
    what you type is sent to our <strong>private</strong> support tracker on GitHub. Please don't type
    personal details (like a name or email address) into a report — the form reminds you of this too.
  </p>
  <p>
    For a bug, you can <em>optionally</em> tick a box to include basic device details (like your app version,
    platform, operating system, device model or browser, screen and window sizes, pixel ratio, language,
    display mode, and online status) to help us reproduce the problem. It's off by default, you can expand
    it to see exactly what will be sent first, and some of those details (such as a browser's full user-agent
    or a device model) can be somewhat identifying — so it's entirely your choice. We never add your name,
    account, location, advertising ID, or the installation value used for the free allowance.
  </p>

  <h3>Saving pictures</h3>
  <p>
    Saved pictures stay <strong>local</strong>. Android saves them in a Splotch gallery album;
    iPhone and iPad save them to the photo library. On the web, Splotch uses a normal browser
    download, or a folder a parent has chosen in supported desktop browsers. Splotch never uploads a
    saved copy as part of saving it. If AI is used, the separate AI request described above sends
    the current drawing.
  </p>

  <h3>Settings on your device</h3>
  <p>
    Splotch remembers small preferences (like appearance, sound, enabled tools, brush and line
    sizes, and grown-up-check choices) using local storage. Native apps also mirror those settings
    to the operating system's preferences so they survive WebView cleanup; Android cloud backup is
    disabled. A supported desktop browser can separately remember a parent-chosen save-folder handle
    in IndexedDB. These preferences stay on the device and are not sent to us. The locally stored AI
    access code and own-key storage are described above. On the web, a random local installation
    value is used only to create the one-way free-allowance code.
  </p>

  <h3>Children's privacy</h3>
  <p>
    Splotch is designed for young children. It has no accounts, ads, tracking, or analytics, and has
    no advertising, analytics, or tracking SDKs. When the app opens online with magic images enabled
    and no other credential, it checks the free allowance using the one-way installation code; no
    drawing is sent during that check. Parent Center has separate policies for generating an AI
    image, reporting an AI picture or refusal, opening an external link, sending feedback, and
    opening Parent Center itself. The App Store and Google Play versions start with every policy set
    to Every time; the web starts with them set to Never. A parent can change each policy to Every
    time, Per session, or Never, except that iOS never allows external links to be permanently
    unchecked. Opening Settings or a bundled page such as this policy is not a grown-up check. These
    checks protect action boundaries; they are not accounts or proof of legal consent.
  </p>
  <p>
    Splotch does not ask for a child's name, email address, account, or location, and does not use
    submitted content to identify a child. These choices minimize children's data and support the
    protections required by COPPA and the GDPR. There are no social features, comments, chat, public
    sharing, advertising, purchases, or subscriptions.
  </p>

  <h3>Changes to this policy</h3>
  <p>
    If we ever change this policy, we'll update the date at the top of this page. We'll keep it just
    as plain and honest as it is today.
  </p>

  <h3>Contact</h3>
  <p>
    Questions or concerns? Send them through our {@render feedbackLink()} and we'll take a look.
  </p>
</PageShell>

{#if ParentalGate}
  <ParentalGate manageDestination={openPrivacyParentCenter} />
{/if}
{#if SettingsModal && managingPolicies}
  <SettingsModal />
{/if}

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
