<script lang="ts">
  // Parent-facing privacy policy, required by both app stores (see the `mobile`
  // skill's store-release checklist). Plain language, short sections, and the
  // shared contents rail/disclosure pattern so a parent can jump to the part
  // they care about. Several sentences are load-bearing disclosures pinned
  // (whitespace-compacted) by tools/mobile/privacy-permission-inventory.json —
  // reword those only in lockstep with that inventory
  // (tools/mobile/tests/privacy-consistency.test.mjs). Bump LAST_UPDATED
  // whenever the wording changes.

  import { onMount } from 'svelte';
  import PageShell from '$lib/components/page/PageShell.svelte';
  import RuleLabel from '$lib/components/page/RuleLabel.svelte';
  import SidebarToc, { type SidebarTocItem } from '$lib/components/nav/SidebarToc.svelte';
  import TocDisclosure from '$lib/components/nav/TocDisclosure.svelte';
  import { GENERATION_JOB_TTL_MS } from '$lib/ai/limits';
  import { FREE_GENERATION_LIMIT } from '$lib/freeGenerations';
  import { scheduleIdle } from '$lib/idle';
  import { IMAGE_REPORT_RETENTION_DAYS } from '$lib/imageReport';
  import { paletteHex } from '$lib/palette';
  import { FEEDBACK_URL } from '$lib/siteUrl';
  import { USAGE_RECORD_RETENTION_DAYS } from '$lib/usageRecord';
  import { HIGHLIGHTS, SECTIONS, SPY_LINE_PX, watchReadingPosition } from './contents';
  import type { SectionId } from './contents';
  import { createPrivacyParentCenter } from './parentCenter.svelte';

  const LAST_UPDATED = 'August 20, 2026';
  const GENERATION_JOB_TTL_MINUTES = GENERATION_JOB_TTL_MS / 60_000;

  const tocItems: SidebarTocItem<SectionId>[] = SECTIONS.map(({ id, label }) => ({
    id,
    label,
    href: `#${id}`,
  }));

  let active = $state<SectionId>(SECTIONS[0].id);
  // Whether the reader has reached any section yet. The collapsed contents row
  // states what the page holds until then and names the section being read
  // after — derived apart from `active`, which is seeded and can't say "the
  // short version".
  let entered = $state(false);

  $effect(() =>
    watchReadingPosition((reading) => {
      active = reading.active;
      entered = reading.entered;
    })
  );

  const parentCenter = createPrivacyParentCenter();
  const gatedLink = parentCenter.gatedLink;

  onMount(() => scheduleIdle(parentCenter.mountParentalGate));
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
    <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" use:gatedLink
      >private feedback form</a
    >
  {:else}
    <a href="/feedback">private feedback form</a>
  {/if}
{/snippet}

<div class="privacy" style:--spy-line="{SPY_LINE_PX}px">
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

    <div class="details-body">
      <div class="contents-rail">
        <SidebarToc items={tocItems} {active} label="Privacy policy contents" />
      </div>

      <!-- Narrow screens get the same anchors behind one sticky row, the
           /changelog treatment. Closed on every load. -->
      <TocDisclosure
        class="contents-disclosure"
        items={tocItems}
        {active}
        showCount={!entered}
        label="Privacy policy contents"
        noun="sections"
        stickyTop="0px"
      />

      <div class="sections">
        <section id="on-device">
          <h3>What stays on your device</h3>
          <p>
            Ordinary drawing never leaves your device. Splotch does not build a profile of you or
            your child, does not sell information, and shows no advertising. Three features can send
            something you made or wrote, and a grown-up starts each one: making an AI picture,
            reporting one, and sending feedback. Each is described below. The app's other requests
            are the ordinary kind any website makes — loading the app itself, downloading coloring
            pages, checking the free-picture count — and none of them includes a drawing.
          </p>
          <p>
            Saved pictures stay local too. Android puts them in a Splotch album in your gallery;
            iPhone and iPad add them to your photo library; the web uses a normal browser download,
            or a folder you pick in a supported desktop browser. Saving never uploads anything.
          </p>
          <p>
            Settings — appearance, sound, enabled tools, brush sizes, grown-up-check choices — are
            stored on your device and never sent to us. An access code or your own OpenAI key is
            stored on the device too: the code alongside those settings, the key in the device's
            secure storage (the Keychain on Apple devices) and encrypted in the browser on the web.
            Unlike a setting, either one is sent to us — once when a grown-up adds it, so we can
            check it, and again each time someone makes or reports an AI picture with it.
          </p>
        </section>

        <section id="ai-pictures">
          <h3>Making an AI picture</h3>
          <p>
            The AI image button redraws your child's drawing in a chosen art style. It is Splotch's
            one big online feature: when someone taps the button, the current drawing is sent to our
            image service (which uses OpenAI), and the finished picture is sent straight back.
            Nothing is sent before the tap. The button follows the grown-up check set in Parent
            Center, hides while the device is offline, and can be switched off entirely in Settings
            (“Create AI Images”). Every install starts with {FREE_GENERATION_LIMIT} free pictures, counted
            on our server (see <a href="#counting">How the counting works</a>). After those, a
            grown-up can add an access code or their own OpenAI key in Settings.
          </p>
          <p>
            <strong>We keep nothing once a picture is delivered.</strong> Our service holds the
            drawing just long enough to hand it to the generator, and holds the finished picture
            until the app collects it; then we delete our copy immediately. An uncollected picture
            expires after {GENERATION_JOB_TTL_MINUTES}
            minutes, and an hourly cleanup removes its remaining files. The one exception is a report
            a grown-up confirms — see <a href="#reports">Reporting a picture</a>.
          </p>
          <p>
            OpenAI generates the picture on its own systems, under the
            <a
              href="https://openai.com/policies/services-agreement/"
              target="_blank"
              rel="noopener noreferrer"
              use:gatedLink
            >
              OpenAI Services Agreement</a
            >. By default, OpenAI does not use what we send to train its models — only an account
            that opts in shares content that way. OpenAI does keep a copy to check for abuse. That
            copy is normally kept for up to 30 days; OpenAI's
            <a
              href="https://developers.openai.com/api/docs/guides/your-data"
              target="_blank"
              rel="noopener noreferrer"
              use:gatedLink
            >
              published policy</a
            > lets it keep one longer where the law requires it or where a copy is needed to stop harm.
            If a safety scan flags a picture as possible child sexual abuse material, OpenAI keeps it
            for a person to review, whatever the account settings say. Those copies are OpenAI's, not
            ours. Our requests also tell OpenAI not to save the finished picture for later use — the one
            part of its retention we control.
          </p>
          <p>
            With your <em>own</em> OpenAI key, the drawing takes the same path but reaches OpenAI
            under <em>your</em> account and your account's terms — including its training setting. Check
            that setting before adding a key: if your account opts in to sharing, it is your child's drawing
            that would be shared. Our service passes your key along for that one request and never stores
            it.
          </p>
        </section>

        <section id="counting">
          <h3>How the counting works</h3>
          <p>
            To count the {FREE_GENERATION_LIMIT} free pictures fairly, the app has to recognize an install
            without knowing whose it is. So it sends a one-way code — a scrambled value that cannot be
            turned back into what it came from. The native apps make it by hashing the platform-provided
            app or vendor identifier; the web hashes a random value created and kept in that browser.
            We never receive the underlying identifier, and the code is never combined with an account,
            advertising ID, hardware fingerprint, or location.
          </p>
          <p>
            With that code we store attempt and success counts, timestamps, and broad failure
            reasons — enough to enforce the limit and nothing more. A separate anonymous daily total
            caps what the free service can spend. On the web, clearing site data creates a new code;
            uninstalling on iOS sometimes does too. On Android the code normally survives a
            reinstall.
          </p>
          <p>
            An access code gets a small tally of its own: how many times it was used, first and
            latest use, and broad style and outcome categories. The tally is keyed by a one-way
            identifier — not the access code itself — and never contains a drawing. It expires {USAGE_RECORD_RETENTION_DAYS}
            days after its first use; later uses do not extend that deadline. Daily cleanup removes expired
            tallies. Retiring an access code also asks for its tally to be deleted right away; if that
            request fails, the fixed expiry still removes it.
          </p>
          <p>
            Access-code and own-key requests also write an ordinary operational server log: the
            date, credential category, art-style category, and outcome — never the drawing, the
            access code, or your key. Netlify retains function logs for at least 24 hours and,
            depending on the hosting plan, makes up to 7 days available. None of this is used for
            advertising, tracking, or product analytics.
          </p>
        </section>

        <section id="reports">
          <h3>Reporting a picture</h3>
          <p>
            Every finished AI picture is labeled “AI-generated picture.” If one is wrong or
            inappropriate, a grown-up can choose “Report this picture,” review exactly what will be
            sent, and send it to us for human review. Nothing is kept unless that final confirmation
            happens.
          </p>
          <p>
            When a grown-up confirms a picture report, we store the drawing, the exact instruction
            our server wrote for the generator, the chosen art style, the report time, and the AI
            picture — privately, on Splotch's Netlify account. A private GitHub support issue tells
            us where to look; it carries report details, never the images. We investigate and
            respond within 24 hours. A daily cleanup deletes the report after
            <strong>{IMAGE_REPORT_RETENTION_DAYS} days</strong>. To ask us to delete one sooner, use
            the {@render feedbackLink()} and include the reference shown after sending.
          </p>
          <p>
            If the AI refuses a harmless drawing, a grown-up can choose “Report this refusal”
            instead. Confirming sends the refused drawing, the same instruction and style details,
            OpenAI's refusal reason, and the report time. There is no generated picture to include.
            A refusal is kept only when a grown-up reports it.
          </p>
        </section>

        <section id="feedback">
          <h3>Sending feedback</h3>
          <p>
            Grown-ups can report a bug or suggest a feature from Settings. When you tap “Send
            report,” only what you type is sent to our <strong>private</strong> support tracker on GitHub.
            Please don't put personal details, like a name or email address, in a report. The form reminds
            you of this too.
          </p>
          <p>
            For a bug, you can check a box to include basic device details — app version, platform,
            operating system, device model or browser, screen and window sizes, pixel ratio,
            language, display mode, and online status — to help us reproduce the problem. It's off
            by default, and you can expand it first to see exactly what would be sent. A few of
            those details, like a full browser user-agent, can be somewhat identifying, so it stays
            your choice. We never add your name, location, advertising ID, or the code used to count
            free pictures.
          </p>
        </section>

        <section id="hosting">
          <h3>Hosting and downloads</h3>
          <p>
            Splotch — the website, the API, and the stored reports above — is hosted by Netlify.
            Loading the app there works like loading any website: the request carries normal details
            such as an IP address and browser version. Our API holds the address briefly in memory
            to slow down abuse; it is not stored with the counting records and not used to follow a
            person or device.
          </p>
          <p>Two requests happen on their own, and neither carries a drawing:</p>
          <ul>
            <li>
              With coloring books enabled, the app downloads coloring pages from our own site — the
              same kind of request that loads the app itself.
            </li>
            <li>
              If the site's security rules block something unexpected, the browser can send us a
              short automatic note (the page address, the blocked address, and a small code sample)
              so we can fix it. There is no third-party error service.
            </li>
          </ul>
          <p>
            Links that leave Splotch — OpenAI's policies above, our GitHub project page — open only
            when tapped. In the store apps they follow the external-links grown-up check.
          </p>
        </section>

        <section id="children">
          <h3>Children's privacy</h3>
          <p>
            Splotch is made for young children, so the protection is built into the design: no
            accounts, no ads, no analytics or tracking code, no chat, comments, or public sharing,
            and no purchases. We never ask for a child's name, email address, or location, and we do
            not use submitted content to identify a child. These choices minimize children's data
            and support the protections required by COPPA and the GDPR.
          </p>
          <p>
            Every action that reaches beyond drawing — making an AI picture, reporting one, opening
            an external link, sending feedback, and opening Parent Center — sits behind its own
            grown-up check. A grown-up can set each one to Every time, Per session, or Never in
            Parent Center. The store apps start with every check set to Every time; the web starts
            with Never; iOS does not allow external links to be set to Never. These checks guard
            actions; they are not accounts, and they are not legal proof of consent.
          </p>
          <p>
            When the app opens online with AI pictures enabled and no credential added, it checks
            the remaining free count using the one-way code above. No drawing is sent during that
            check.
          </p>
        </section>

        <section id="contact">
          <h3>Changes and contact</h3>
          <p>
            If this policy changes, the date at the top changes with it. Questions or concerns? Send
            them through our {@render feedbackLink()} and we'll take a look.
          </p>
        </section>
      </div>
    </div>
  </PageShell>
</div>

{#if parentCenter.gateComponent}
  {@const Gate = parentCenter.gateComponent}
  <Gate manageDestination={parentCenter.openParentCenter} />
{/if}
{#if parentCenter.modalComponent && parentCenter.managingPolicies}
  {@const Modal = parentCenter.modalComponent}
  <Modal />
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

  /* The /changelog two-column shape: a sticky contents rail beside the reading
     column. Both off the spacing scale on purpose: the rail is the width that
     holds "What stays on your device" on one row at --font-size-sm, and the
     gutter is what leaves the sections beside it inside --page-measure. */
  .details-body {
    --rail-width: 226px;
    --rail-gutter: 48px;

    display: grid;
    grid-template-columns: var(--rail-width) minmax(0, 1fr);
    gap: var(--rail-gutter);
    align-items: start;
  }

  /* The contents leaves the reading column entirely, so "where am I / what else
     is there" is answerable at any scroll depth rather than only at the top. */
  .contents-rail {
    position: sticky;
    top: var(--space-6);
  }

  /* The two treatments are the same anchors; only one is ever laid out, so
     neither the accessibility tree nor a scan ever sees both. */
  .details-body :global(.contents-disclosure) {
    display: none;
  }

  /* Where a jumped-to section parks. The disclosure computes its own jumps, so
     this is for the jumps it doesn't make: the rail's anchors and a deep link
     into the page. On wide that only has to clear the rail's top offset. */
  .sections section {
    scroll-margin-top: var(--section-park, var(--space-6));
    padding: var(--space-6) 0;
    border-top: var(--border-width) solid var(--page-rule);
  }

  /* "The details" already rules the column off; a hairline right under it
     would read as a double strike. */
  .sections section:first-child {
    padding-top: 0;
    border-top: none;
  }

  /* A scrollspy keyed on "the section's top has crossed the line" cannot
     promote a section with less below it than a scrollport: the scroll clamps
     while the last sections are still under the line, and picking one from the
     contents names a different section on arrival. Reserving a scrollport's
     worth from the last section's top is what lets it — and every section
     above it — climb to the line. --page-tail deliberately underestimates the
     room the shell leaves under the sheet (40px on a phone, more on wider
     breakpoints): underestimating only adds reserve, and the slack keeps the
     last section's top clear of the line instead of exactly on it. */
  .sections section:last-child {
    --page-tail: 16px;

    min-height: calc(100dvh - var(--spy-line) - var(--page-tail));
  }

  h3 {
    margin: 0 0 6px;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: var(--page-ink);
  }

  p,
  .sections ul {
    max-width: var(--page-measure);
    margin: 0 0 12px;
    color: var(--page-body);
  }

  .sections ul {
    padding-left: 1.2em;
  }

  .sections li {
    margin-bottom: 8px;
  }

  a {
    color: var(--page-link);
    text-underline-offset: 3px;
    text-decoration-thickness: 1px;
  }

  /* A 226px rail beside a fluid sheet squeezes the sections, so the whole
     tablet and phone range takes the disclosure instead — the same breakpoint
     the shell drops its fixed sheet width at. The grid goes with it: a sticky
     rail is pinned only as far as its containing block reaches, and a grid
     item's area is exactly its own height. */
  @media (max-width: 920px) {
    /* The contents row pins flush to the top and stands ~72px tall with its
       own padding, so a jumped-to section has to clear both plus air. */
    .privacy {
      --section-park: 96px;
    }

    .details-body {
      display: block;
    }

    .contents-rail {
      display: none;
    }

    /* Pinned, the row needs a ground of its own: it pins flush to the top and
       pads itself down, which puts the gap above it inside its own box and
       under its own background. */
    .details-body :global(.contents-disclosure) {
      display: block;
      padding-top: var(--space-4);
      background: var(--page-sheet);
      margin-bottom: var(--space-4);
    }
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
