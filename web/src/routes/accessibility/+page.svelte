<script lang="ts">
  // Parent-facing accessibility statement (issue #1430): a scoped, factual
  // claim for the grown-up surfaces, the toddler canvas named as outside it, and
  // the gaps we know about. It wears /privacy's shell and contents rail; the
  // claim it makes is bounded by what web/tests/a11y.spec.ts scans, so a
  // surface joins the "covers" list only once that spec scans it. Bump
  // LAST_UPDATED whenever the wording changes.

  import { onMount } from 'svelte';
  import PageShell from '$lib/components/page/PageShell.svelte';
  import SocialCard from '$lib/components/page/SocialCard.svelte';
  import RuleLabel from '$lib/components/page/RuleLabel.svelte';
  import SidebarToc, { type SidebarTocItem } from '$lib/components/nav/SidebarToc.svelte';
  import TocDisclosure from '$lib/components/nav/TocDisclosure.svelte';
  import { SPY_LINE_PX, watchReadingPosition } from '$lib/components/nav/readingPosition';
  import { createPageParentCenter } from '$lib/components/page/pageParentCenter.svelte';
  import { scheduleIdle } from '$lib/idle';
  import { FEEDBACK_URL } from '$lib/siteUrl';
  import { SECTIONS } from './contents';
  import type { SectionId } from './contents';

  const LAST_UPDATED = 'September 22, 2026';
  const DESCRIPTION =
    "Splotch's accessibility statement: which parts target WCAG 2.1 AA, how we check, and what still falls short.";

  const tocItems: SidebarTocItem<SectionId>[] = SECTIONS.map(({ id, label }) => ({
    id,
    label,
    href: `#${id}`,
  }));

  let active = $state<SectionId>(SECTIONS[0].id);
  let entered = $state(false);

  $effect(() =>
    watchReadingPosition(SECTIONS, (reading) => {
      active = reading.active;
      entered = reading.entered;
    })
  );

  const parentCenter = createPageParentCenter();
  const gatedLink = parentCenter.gatedLink;

  onMount(() => scheduleIdle(parentCenter.mountParentalGate));
</script>

<svelte:head>
  <title>Accessibility · Splotch</title>
  <meta name="description" content={DESCRIPTION} />
</svelte:head>

<SocialCard
  path="/accessibility"
  title="Splotch Accessibility Statement"
  description={DESCRIPTION}
/>

{#snippet feedbackLink()}
  {#if __IS_CAPACITOR__}
    <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" use:gatedLink
      >private feedback form</a
    >
  {:else}
    <a href="/feedback">private feedback form</a>
  {/if}
{/snippet}

<div class="statement" style:--spy-line="{SPY_LINE_PX}px">
  <PageShell title="Accessibility statement" wordmark="Splotch">
    {#snippet lede()}
      Splotch is a drawing app made for little kids. This page says which parts of it we hold to an
      accessibility standard, how we check, and where it still falls short.
    {/snippet}

    <p class="updated">Last updated {LAST_UPDATED}</p>

    <div class="details-body">
      <div class="contents-rail">
        <SidebarToc items={tocItems} {active} label="Accessibility statement contents" />
      </div>

      <!-- Narrow screens get the same anchors behind one sticky row, the
           /privacy treatment. Closed on every load. -->
      <TocDisclosure
        class="contents-disclosure"
        items={tocItems}
        {active}
        showCount={!entered}
        label="Accessibility statement contents"
        noun="sections"
        stickyTop="0px"
      />

      <div class="sections">
        <section id="scope">
          <RuleLabel>What this statement covers</RuleLabel>
          <p>
            Splotch has two kinds of screen. The grown-up pages are the ones a parent reads or fills
            in: this statement, the <a href="/privacy">privacy policy</a>, the changelog, the beta
            sign-up page, the feedback form, the design guide, the admin console, and the Settings
            dialog inside the app, including Parent Center and the grown-up check. Those surfaces
            target WCAG 2.1 level AA and are tested against it before a change ships.
          </p>
          <p>
            That is the whole claim. It applies to the website and to the same pages inside the
            Android and iPhone apps, in light and night mode alike.
          </p>
        </section>

        <section id="canvas">
          <RuleLabel>What it leaves out on purpose</RuleLabel>
          <p>
            The drawing screen is built for a two-year-old, and it is not part of that claim. Its
            controls are giant wordless buttons with no reading order, sized for a small hand and a
            crayon grip. That is a design decision, not an omission: a toddler cannot read a label,
            follow a focus ring, or work through a menu, so the canvas does what a crayon does and
            nothing more.
          </p>
          <p>
            We do not claim WCAG conformance for the drawing screen, and we do not intend to
            redesign it around adult assistive technology. The parts of the app a grown-up manages
            are the grown-up pages, and those are where the standard applies.
          </p>
        </section>

        <section id="checks">
          <RuleLabel>How we check</RuleLabel>
          <p>
            Every grown-up surface is scanned by an automated accessibility checker on every change,
            and a serious or critical finding stops the change from shipping. The checker leaves
            some things undecided, such as very short labels, placeholder text, and dialogs whose
            background it cannot resolve, so for those we compute the contrast ratio ourselves, in
            both light and night mode wherever the colours follow the theme.
          </p>
          <p>
            The colour chips on the design guide choose black or white text by measured contrast,
            and a test proves every chip clears the AA ratio in both themes. Dialogs hold and return
            keyboard focus, and the actions a grown-up can reach from a keyboard or a desktop screen
            reader, including clearing the drawing, are covered by automated tests too.
          </p>
        </section>

        <section id="limitations">
          <RuleLabel>Known limitations</RuleLabel>
          <p>
            <strong>Clearing the drawing with a mobile screen reader.</strong> A keyboard or a desktop
            screen reader can clear the canvas by activating the Clear button. The button only clears
            on a deliberate drag, so a toddler cannot wipe a drawing by tapping it, and VoiceOver and
            TalkBack activate a button with a double-tap that reaches the app as a tap with no drag in
            it. On a phone or tablet screen reader the button announces itself but does not clear. We
            know about this and have not settled on a fix that keeps the toddler-proofing.
          </p>
          <p>
            <strong>Reduced motion with JavaScript off.</strong> Reduce Motion in Settings, and the operating
            system's own setting, calm every animation while the app is running. The grown-up pages are
            delivered as plain documents that also render with JavaScript disabled, and in that state
            nothing reads the setting, so the design guide's motion samples keep moving.
          </p>
          <p>
            <strong>We test in a browser.</strong> The store apps show the same pages inside a web view,
            and our checks run against the website rather than inside the apps. A difference that only
            appears in the app's web view would not be caught by them.
          </p>
        </section>

        <section id="contact">
          <RuleLabel>Changes and contact</RuleLabel>
          <p>
            If a grown-up page is hard to use with a screen reader, a keyboard, a switch, or any
            other assistive technology, tell us through our {@render feedbackLink()} and we'll take a
            look. If this statement changes, the date at the top changes with it.
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
     token, so the statement follows the parent's night-mode preference like
     every other page. */

  .updated {
    margin: 0 0 var(--space-8);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    letter-spacing: 0.06em;
    color: var(--page-muted);
  }

  /* The /privacy two-column shape: a sticky contents rail beside the reading
     column, on PageShell's shared rail width and gutter. */
  .details-body {
    display: grid;
    grid-template-columns: var(--page-rail-width) minmax(0, 1fr);
    gap: var(--page-rail-gutter);
    align-items: start;
  }

  .contents-rail {
    position: sticky;
    top: var(--space-6);
  }

  /* The two treatments are the same anchors; only one is ever laid out, so
     neither the accessibility tree nor a scan ever sees both. */
  .details-body :global(.contents-disclosure) {
    display: none;
  }

  /* Where a jumped-to section parks; see /privacy for the reasoning. Each
     section opens on its own RuleLabel, whose hairline rules the column off,
     so no border-top of its own. */
  .sections section {
    scroll-margin-top: var(--section-park, var(--space-6));
    padding: var(--space-4) 0 var(--space-6);
  }

  .sections section:first-child {
    padding-top: 0;
  }

  /* Reserves a scrollport under the last section so the scrollspy can reach
     it — the same arithmetic as /privacy, with the same tail underestimate. */
  .sections section:last-child {
    --page-tail: 16px;

    min-height: calc(100dvh - var(--spy-line) - var(--page-tail));
  }

  p {
    max-width: var(--page-measure);
    margin: 0 0 12px;
    color: var(--page-body);
  }

  .sections strong {
    color: var(--page-ink);
  }

  a {
    color: var(--page-link);
    text-underline-offset: 3px;
    text-decoration-thickness: 1px;
  }

  /* The tablet and phone range takes the disclosure instead of the rail, at
     the same breakpoint /privacy and the shell use. */
  @media (max-width: 920px) {
    .statement {
      --section-park: 96px;
    }

    .details-body {
      display: block;
    }

    .contents-rail {
      display: none;
    }

    .details-body :global(.contents-disclosure) {
      display: block;
      --toc-row-inset: var(--space-4);
      padding-top: var(--toc-row-inset);
      background: var(--page-sheet);
      margin-bottom: var(--space-4);
    }
  }

  @media (hover: hover) {
    a:hover {
      text-decoration-thickness: 2px;
    }
  }
</style>
