<script lang="ts">
  import { tick, untrack } from 'svelte';
  import SidebarToc, { type SidebarTocItem } from '../nav/SidebarToc.svelte';
  import ScrollCue from '../design/ScrollCue.svelte';
  import SectionBody from './SectionBody.svelte';
  import ParentCenterLock from './ParentCenterLock.svelte';
  import { SECTIONS, sectionHeading, type SectionId } from './sections';
  import { createStagedSections } from './stagedSections.svelte';
  import { revealNavRow, scrollPaneToSection, spiedSectionAt } from './paneScroll';
  import { settingsModal } from '$lib/state/ui.svelte';
  import { pinchTextZoom } from '$lib/actions/pinchTextZoom.svelte';
  import { registerElement } from '$lib/actions/elementRegistry';
  import { requireParentalGate, requiresParentalGate } from '$lib/state/parentalGate.svelte';
  import { buttonCenter } from '$lib/state/modal.svelte';
  import { hasSectionActivity, markSectionSeen } from '$lib/state/sectionsSeen.svelte';
  import '$lib/components/deferredIcons';
  import { prefersReducedMotion } from '$lib/platform/reducedMotion';

  interface Props {
    /** Where the pane parks on each open — the deep-linked section, else the first. */
    landingSection: SectionId;
    /** Advances on each open transition, as the dialog action reports it to SettingsModal. */
    openGeneration: number;
  }

  let { landingSection, openGeneration }: Props = $props();

  // The sidebar is a table of contents over the continuous pane: this is the
  // section the reading position currently sits in, an indicator rather than a
  // page state.
  let spiedSection = $state<SectionId>(SECTIONS[0].id);

  // The phone shell gates the drill-in, but this shell stacks every section in
  // reach of a scroll, so Parent Center's own controls stay behind a lock card
  // until the gate this open is solved (ADR-0094 puts the gate at the operation
  // boundary, and reaching these controls is that boundary).
  let parentCenterUnlocked = $state(false);
  let parentCenterRevealed = $derived(
    parentCenterUnlocked || !requiresParentalGate('parentCenter')
  );

  // What the opening tap itself constructs. Not one frame's worth: the default
  // landing shows Appearance *and* Sound above the fold on the viewports that
  // select this shell, and content the parent is already looking at arriving
  // with the fill reads as a glitch, not as the pane growing off-screen below.
  // The long task issue #910 measured was all eleven bodies together; these two
  // are a handful of toggle/slider rows, well inside the tap's budget.
  const OPENING_SECTION_COUNT = SECTIONS.findIndex((section) => section.id === 'sound') + 1;

  // Which sections exist in the pane and which are painted — the staged fill
  // that keeps the open under its frame budget (issue #910).
  const staging = createStagedSections(SECTIONS.length, OPENING_SECTION_COUNT);
  const mountedSections = $derived(SECTIONS.slice(0, staging.mountedCount));

  // The table of contents is the shared guide-rail sidebar; only the icon and
  // the label differ per section, so the list is the whole configuration.
  const navItems = $derived<SidebarTocItem<SectionId>[]>(
    SECTIONS.map((section) => ({
      id: section.id,
      label: section.label,
      icon: section.icon,
      unseen: hasSectionActivity(section.id),
    }))
  );

  // Plain refs, deliberately untracked: the reopen reset reads the nav inside a
  // frame callback and the scrollspy reads the sections off events, so nothing
  // re-renders when any of them arrives. The pane and its zoom target are
  // `$state` because the scrollspy effect below has to start once they exist.
  let navEl: HTMLElement | undefined;
  const sectionEls: Partial<Record<SectionId, HTMLElement>> = {};
  let paneEl = $state<HTMLElement>();
  let zoomTarget = $state<HTMLElement>();

  const sectionHeadingId = (id: SectionId) => `settingsSection-${id}`;

  const sectionIndex = (id: SectionId) => SECTIONS.findIndex((section) => section.id === id);

  function markDisplayedSectionSeen(id: SectionId) {
    if (id === 'parentCenter' && !parentCenterRevealed) return;
    markSectionSeen(id);
  }

  // Paired with `use:registerElement` in place of `bind:this={table[id]}`, which
  // warns once per list item because these tables are deliberately not `$state`
  // (see the refs above).
  const registerIn =
    (table: Partial<Record<SectionId, HTMLElement>>, id: SectionId) =>
    (element: HTMLElement | undefined) => {
      if (element) table[id] = element;
      else delete table[id];
    };

  // A long jump is animated, but the parent may have asked the OS for less
  // motion — and Chrome does not apply that preference to programmatic smooth
  // scrolls on its own. A jump made while the pane is still filling is instant
  // for a second reason: it will have to be re-aimed as the sections above it
  // settle, and an animation still in flight leaves nothing to re-aim against —
  // scrollTop sits between the two positions, which reads exactly like the
  // parent having scrolled the pane themselves.
  function jumpBehavior(): ScrollBehavior {
    if (!staging.fullyMounted) return 'auto';
    return prefersReducedMotion() ? 'auto' : 'smooth';
  }

  // The section a jump asked for while the pane was still filling. A jump can
  // only be computed from the offsets that exist when the row is tapped, and
  // everything above the target goes on changing height afterwards — the fill
  // mounting those sections, and their own conditional reveals landing
  // (persisted state, the free-generation fetch). Each one moves the target
  // under a pane that has already scrolled, which is how a tap on Saving
  // settles with the reading line back inside AI Art and the table of contents
  // naming a section the parent did not choose. Worse, until enough of the pane
  // exists *below* the target there is no scroll extent to reach it with, so
  // the first attempt lands clamped however correct its arithmetic was.
  //
  // So a jump made mid-fill stays pending: it re-aims on every content resize,
  // and once more when the pane is finally whole. From there the position is
  // the parent's — and any hand on the pane ends it sooner.
  // Deliberately untracked: only the handlers below read it, nothing renders it.
  let pendingJump: SectionId | null = null;

  // A smooth jump crosses section reading lines the parent did not choose to
  // visit. Deliberately untracked: event handlers only use this target to keep
  // those transient elections from persisting as seen.
  let smoothJumpTarget: SectionId | null = null;

  function scrollToSection(id: SectionId, behavior: ScrollBehavior) {
    const el = sectionEls[id];
    const pane = paneEl;
    if (!el || !pane) return;
    if (behavior === 'smooth') smoothJumpTarget = id;
    scrollPaneToSection(pane, el, behavior);
  }

  // A quick close-then-reopen can beat the after-close restaging — on the
  // shipping iOS path (no requestIdleCallback) the cooperative fallback drains
  // one section per ~quarter second, so a reopen half a second later still
  // finds most sections presented, and showModal's flip would repaint them all
  // at once (the physical-iPad open gate scored exactly that paint). Dropping
  // the watermark on the open transition, in the same flush as the flip,
  // guarantees the open frame paints nothing regardless of how far the
  // restaging got; the landing below then presents the fold a frame later.
  // Only the open *transition* may drop it — a deep-link landing while already
  // open must never blank the visible pane — which is why this keys on the
  // dialog action's open count rather than on the landing section.
  $effect(() => {
    void openGeneration;
    if (settingsModal.open) staging.resetPresentation();
  });

  // The dialog is closed, never unmounted, so both the nav and the pane keep the
  // offsets the parent left them at — which would reopen with the landing
  // section highlighted while the pane still shows wherever they stopped
  // reading. A deep-linked section scrolls into place instead of swapping in.
  // Re-runs on each open and on each landing change while open.
  $effect(() => {
    if (!settingsModal.open) {
      pendingJump = null;
      smoothJumpTarget = null;
      return;
    }
    const landing = landingSection;
    // Landing on Parent Center is only ever requested by a solved challenge (the
    // gate's own way into the policy editor), so that landing arrives already
    // unlocked — asking again for the section the solve was spent on would make
    // the solve worthless. Every other landing re-locks.
    parentCenterUnlocked = landing === 'parentCenter';
    // Bookkeeping, deliberately untracked: the reveal check inside reads the
    // gate policy and the unlock just written above, and neither should re-run
    // the landing.
    untrack(() => markDisplayedSectionSeen(landing));
    spiedSection = landing;
    // A section's offset depends only on what stacks above it, so mounting the
    // run up to the landing section is what makes the landing scroll below land
    // on a true offset. Presentation waits for the frame callback below.
    staging.mountAtLeast(Math.max(OPENING_SECTION_COUNT, sectionIndex(landing) + 1));
    let stopFill: (() => void) | undefined;
    // The open flip promotes the card to the top layer and moves focus into
    // it, either of which can overwrite a scroll aimed at the same moment —
    // and on a tap that beat the prewarm the card may only now be getting its
    // layout box, where the browser restores the offsets it kept. Waiting a
    // frame is what makes the reset stick rather than be overwritten. (A
    // prewarmed card is laid out while closed — SettingsModal keeps it
    // `visibility: hidden` rather than `display: none` — so its offsets are
    // real before the open, too.)
    const frame = requestAnimationFrame(() => {
      // The landing view paints here, one frame after the flip that showed the
      // dialog: the card is still near its launch scale, so the fold arriving
      // a frame late is invisible, and the open's own frame stays paint-free.
      staging.presentAtLeast(Math.max(OPENING_SECTION_COUNT, sectionIndex(landing) + 1));
      navEl?.scrollTo({ top: 0 });
      revealNavRow(navEl, landing, 'auto');
      // A deep-linked landing is a jump like any other, and pays the same way:
      // the sections above it are still arriving when this scroll is computed.
      if (!staging.fullyMounted) pendingJump = landing;
      scrollToSection(landing, 'auto');
      stopFill = staging.fillAfterFlyIn(paneEl?.closest('dialog')?.getAnimations() ?? []);
    });
    return () => {
      cancelAnimationFrame(frame);
      stopFill?.();
    };
  });

  // The closed dialog's idle prewarm and restage. This call's position sets
  // their place in the component's effect order — after the landing effect,
  // before the pending-jump effect — so moving it is a timing change.
  staging.stageWhileClosed();

  // The last word on a pending jump, and the end of it. Until the pane is whole
  // there may not be enough content below the target to scroll it into place at
  // all — the arithmetic is right and the scroll lands clamped — so the jump
  // gets one final aim at the moment the extent exists. From here the scroll
  // position belongs to whoever moves it next.
  $effect(() => {
    if (!staging.fullyMounted || !pendingJump) return;
    scrollToSection(pendingJump, 'auto');
    pendingJump = null;
  });

  // Armed only while the dialog is open: a closed pane has no reader for the
  // spy to follow, and the idle prewarm grows the closed (hidden, or on a
  // pre-prewarm tap display: none) pane section by section — a growth tick
  // there would elect off offsets no one is reading and park the highlight
  // wherever it lands until the open reset.
  $effect(() => {
    if (!settingsModal.open) return;
    const pane = paneEl;
    const content = zoomTarget;
    if (!pane || !content) return;
    let frame = 0;
    const spy = () => {
      frame = 0;
      const next = spiedSectionAt(pane, SECTIONS, sectionEls, staging.fullyMounted);
      const smoothJump = smoothJumpTarget;
      if (next === smoothJump) smoothJumpTarget = null;
      // Not just a dedupe: the reveal below fires on an election change only, so
      // a parent who scrolls the column by hand keeps the position they chose
      // until the reading position moves to another section. Revealing on every
      // tick would yank the column back out from under them mid-gesture.
      if (next === spiedSection) return;
      if (!smoothJump) markDisplayedSectionSeen(next);
      spiedSection = next;
      revealNavRow(navEl, next, jumpBehavior());
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(spy);
    };
    pane.addEventListener('scroll', schedule, { passive: true });
    // A conditional reveal inside a section (volume slider, the tool drawer,
    // force-landscape row, AI toggles) moves every section below it, so the spy
    // re-reads on content growth as well as on scroll — and an unsettled jump
    // re-aims at what it was asked for before the spy elects off the new
    // offsets, rather than leaving the parent parked between two sections.
    const growth = new ResizeObserver(() => {
      if (pendingJump) scrollToSection(pendingJump, 'auto');
      schedule();
    });
    growth.observe(content);
    // Any hand on the pane ends the jump: from here the scroll position is the
    // parent's, and re-aiming it would take the pane back out from under them.
    const releaseJump = () => {
      pendingJump = null;
      smoothJumpTarget = null;
    };
    pane.addEventListener('pointerdown', releaseJump);
    pane.addEventListener('wheel', releaseJump, { passive: true });
    pane.addEventListener('keydown', releaseJump);
    return () => {
      pane.removeEventListener('scroll', schedule);
      pane.removeEventListener('pointerdown', releaseJump);
      pane.removeEventListener('wheel', releaseJump);
      pane.removeEventListener('keydown', releaseJump);
      growth.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  });

  function unlockParentCenter(trigger: HTMLElement, then?: () => void) {
    requireParentalGate(
      'parentCenter',
      () => {
        parentCenterUnlocked = true;
        markSectionSeen('parentCenter');
        then?.();
      },
      buttonCenter(trigger)
    );
  }

  async function jumpToSection(id: SectionId, trigger: HTMLElement) {
    // Every row is in the table of contents from the first frame, so one can be
    // tapped while the pane is still filling in behind it — the section it names
    // has to exist before there is an offset to scroll to, and be painted
    // before there is anything to read at the landing (an explicit jump
    // presents its whole run in one frame; the parent asked to go there).
    if (staging.presentAtLeast(sectionIndex(id) + 1)) await tick();
    const behavior = jumpBehavior();
    // Only a mid-fill jump is left pending: on a whole pane the offsets this
    // reads are already final, and re-aiming later would fight the parent's own
    // scrolling instead of the fill.
    const hold = !staging.fullyMounted;
    if (id !== 'parentCenter' || parentCenterRevealed) {
      markSectionSeen(id);
      if (hold) pendingJump = id;
      scrollToSection(id, behavior);
      return;
    }
    unlockParentCenter(trigger, () => {
      if (hold && !staging.fullyMounted) pendingJump = id;
      scrollToSection(id, behavior);
    });
  }

  // Tier-2 accessibility (ADR-0076). No `resetKey`: a table-of-contents jump
  // stays inside one continuous document, so only closing the overlay (which
  // flips `enabled`) returns the text to its normal size.
  const textZoom = () => ({ target: zoomTarget, enabled: settingsModal.open });
</script>

<!-- Tablet / desktop: table of contents + one continuously scrolling pane. -->
<div class="settings-split">
  <div class="settings-nav" bind:this={navEl}>
    <SidebarToc
      items={navItems}
      active={spiedSection}
      label="Settings sections"
      onSelect={jumpToSection}
    />
  </div>
  <ScrollCue contentPending={!staging.fullyMounted || staging.presentedCount < SECTIONS.length}>
    {#snippet children(end)}
      <div
        class="settings-pane"
        aria-busy={!staging.fullyMounted}
        use:pinchTextZoom={textZoom}
        bind:this={paneEl}
      >
        <div class="settings-zoom" bind:this={zoomTarget}>
          {#each mountedSections as section, index (section.id)}
            <section
              class="settings-section"
              class:staged={index >= staging.presentedCount}
              data-section={section.id}
              aria-labelledby={sectionHeadingId(section.id)}
              use:registerElement={registerIn(sectionEls, section.id)}
            >
              <h3 class="settings-pane-title" id={sectionHeadingId(section.id)}>
                {sectionHeading(section.id)}
              </h3>
              {#if section.id === 'parentCenter' && !parentCenterRevealed}
                <ParentCenterLock onUnlock={unlockParentCenter} />
              {:else}
                <SectionBody id={section.id} onSettled={staging.markStagedContentSettled} />
              {/if}
            </section>
          {/each}
        </div>
        {@render end()}
      </div>
    {/snippet}
  </ScrollCue>
</div>

<style>
  .settings-split {
    /* Every section is stacked in the one pane, so the whitespace and the
       headings do the separating — deliberately more air than any gap inside a
       section, and well past the --space-8 ceiling, so no divider is needed. */
    --section-gap: 60px;

    flex: 1;
    min-height: 0;
    display: flex;
    gap: 8px;
    padding: 0 24px 24px;
  }

  /* The pane is the primary scroller; the nav becomes one wherever the column
     cannot hold the full section list. That includes landscape iPad Safari once
     browser chrome reduces the available height. Contained, so scrolling past
     either end never chains out to the pane.

     The edge shades are the affordance for it, since a row clipped mid-height
     leaves the column looking finished and touch scrollbars don't paint until
     the flick starts. The two `local` covers scroll with the list and sit over
     the shade at whichever end is already at rest, so each shade appears only
     while there is more list that way — the pattern needs no scroll listener.
     Both are backgrounds of this column, so they paint behind SidebarToc's
     track rather than over it. This is the column's whole scroll cue and the
     reason it carries no ScrollCue: the pair already says "more this way" at
     each end, where the primitive speaks only for the bottom, so adding it
     would stack a second fade on an edge that has one. */
  .settings-nav {
    flex-shrink: 0;
    width: 232px;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    background:
      linear-gradient(var(--surface) 40%, transparent) top / 100% 24px no-repeat local,
      linear-gradient(transparent, var(--surface) 60%) bottom / 100% 24px no-repeat local,
      linear-gradient(var(--border), transparent) top / 100% 9px no-repeat scroll,
      linear-gradient(transparent, var(--border)) bottom / 100% 9px no-repeat scroll;
  }

  .settings-pane {
    flex: 1;
    min-width: 0;
    min-height: 0;
    /* overflow (not just -y) so a pinch-enlarged (.settings-zoom) pane scrolls sideways
       too; at rest the content is pane-width, so no horizontal bar shows. */
    overflow: auto;
    padding: 4px 8px 4px 16px;
  }

  .settings-section + .settings-section {
    margin-top: var(--section-gap);
  }

  /* Staged presentation: laid out, not painted. Geometry stays whole — the
     scrollspy and jump arithmetic keep reading true offsets — while the
     pixels arrive one section per frame after the fly-in lands, and leave the
     same way at idle after a close. visibility also parks the section out of
     hit testing, focus, and the accessibility tree until it is presented. */
  .settings-section.staged {
    visibility: hidden;
  }

  .settings-pane-title {
    margin: 0 0 20px;
    /* One step under the dialog's own title, matching the phone shell's
       drill-in sub-heading, so the header reads as the pane's parent. */
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--text-strong);
  }
</style>
