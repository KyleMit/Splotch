<script lang="ts">
  import { tick, untrack } from 'svelte';
  import SidebarToc, { type SidebarTocItem } from '../nav/SidebarToc.svelte';
  import ScrollCue from '../design/ScrollCue.svelte';
  import SectionBody from './SectionBody.svelte';
  import ParentCenterLock from './ParentCenterLock.svelte';
  import { SECTIONS, sectionHeading, type SectionId } from './sections';
  import { settingsModal } from '$lib/state/ui.svelte';
  import { pinchTextZoom } from '$lib/actions/pinchTextZoom.svelte';
  import { registerElement } from '$lib/actions/elementRegistry';
  import { requireParentalGate, requiresParentalGate } from '$lib/state/parentalGate.svelte';
  import { buttonCenter } from '$lib/state/modal.svelte';
  import { hasSectionActivity, markSectionSeen } from '$lib/state/sectionsSeen.svelte';

  interface Props {
    /** Where the pane parks on each open — the deep-linked section, else the first. */
    landingSection: SectionId;
  }

  let { landingSection }: Props = $props();

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

  // Constructing every section body in the one task that opens the dialog was a
  // long task several times the phone hub's on the app's low-end tablet targets
  // (issue #910; `npm run perf:web:settings` scores both shells). They arrive a
  // section per frame instead, top of the pane downwards — the same shape, and
  // the same reasoning, as the idle overlay pump in boot/bootHiddenOverlays.ts:
  // batching the work merely relocates the long task. What must not be deferred
  // is a section's height, since the scrollspy and the jump arithmetic are both
  // specified in live offsets — so a section is either laid out in full or not
  // in the pane at all, never a placeholder.
  const SECTIONS_PER_FRAME = 1;

  // How many sections, from the first, currently exist in the pane — one frame's
  // worth to start with, since the opening tap is itself the first frame. A
  // watermark, never lowered: the dialog is closed rather than unmounted, so a
  // reopen keeps whatever the last open finished mounting and pays nothing again.
  let mountedCount = $state(SECTIONS_PER_FRAME);
  const mountedSections = $derived(SECTIONS.slice(0, mountedCount));

  // Attaching the last section is not the same as the pane being whole. What's
  // New reveals its release-note blocks over frames of its own — ADR-0061 chose
  // that after measuring 43-47ms for mounting them together on desktop WebKit —
  // so the pane goes on growing behind a wrapper that is already in. Waiting for
  // it too is what keeps `fullyMounted` a true statement rather than a nearly
  // true one, and the scroll-end election below depends on that being exact.
  // One flag because one section stages; a second would make this a count.
  let stagedContentSettled = $state(false);
  const fullyMounted = $derived(mountedCount >= SECTIONS.length && stagedContentSettled);

  // How far past the pane's top edge the reading line sits. The highlight flips
  // as a heading approaches that line rather than after it has scrolled away.
  const SCROLLSPY_LINE_INSET_PX = 130;
  // Fractional device pixels and pinch-zoomed content leave scrollTop a hair
  // short of the true end, so "scrolled to the bottom" needs a tolerance.
  const SCROLL_END_EPSILON_PX = 2;
  // Where a table-of-contents jump parks the heading: just clear of the pane's
  // top edge rather than flush against it.
  const SECTION_JUMP_INSET_PX = 12;
  // How far the spied row is kept clear of the nav's own edges, so a row the
  // pane elected does not surface half-buried under the `local` covers in the
  // nav's background. The two extreme rows sit against the ends of the scroll
  // extent and cannot take the full clearance; the covers scroll with the list
  // and paint over the shade there, which is what that attachment is for. Same
  // value and same purpose as `/design`'s `CHIP_SCROLL_INSET_PX`.
  const NAV_ROW_CLEARANCE_PX = 24;

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

  // Raise the watermark to cover `count` sections, reporting whether anything
  // new is on its way in. The read is untracked so the frame pump and the click
  // handler that call this can't re-enter the effect they were started from.
  function mountAtLeast(count: number): boolean {
    const next = Math.min(count, SECTIONS.length);
    if (untrack(() => mountedCount) >= next) return false;
    mountedCount = next;
    return true;
  }

  // The card flies in over its own run of frames, and the fill would otherwise
  // spend them: a section body too big to construct inside one frame drops one
  // of the animation's. So the fill waits for the card to land — nothing may
  // read the pane before then anyway, which is what `aria-busy` states. A
  // cancelled animation rejects `finished`; that leaves nothing to wait for,
  // which is the same answer as landing.
  function fillAfterFlyIn(): () => void {
    let stopPump: (() => void) | undefined;
    let cancelled = false;
    const flyIn = paneEl?.closest('dialog')?.getAnimations() ?? [];
    Promise.all(flyIn.map((animation) => animation.finished.catch(() => undefined))).then(() => {
      if (!cancelled) stopPump = pumpRemainingSections();
    });
    return () => {
      cancelled = true;
      stopPump?.();
    };
  }

  // Each frame asks for one more than the watermark currently holds, rather than
  // counting up privately: a jump can raise the watermark mid-fill, and a
  // private counter would then find nothing left to do and stop the fill for
  // good, stranding every section below the one that was jumped to.
  function pumpRemainingSections(): () => void {
    let frame = 0;
    const mountNext = () => {
      const next = untrack(() => mountedCount) + SECTIONS_PER_FRAME;
      frame = mountAtLeast(next) ? requestAnimationFrame(mountNext) : 0;
    };
    frame = requestAnimationFrame(mountNext);
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }

  // The card flies in scaled from its opening button, so a rect read while that
  // animation runs is not in CSS pixels. A scroller's own visual-to-layout ratio
  // converts a measurement into whatever space the current frame is in.
  function visualScale(el: HTMLElement): number {
    const height = el.clientHeight;
    return height ? el.getBoundingClientRect().height / height : 1;
  }

  // A long jump is animated, but the parent may have asked the OS for less
  // motion — and Chrome does not apply that preference to programmatic smooth
  // scrolls on its own. A jump made while the pane is still filling is instant
  // for a second reason: it will have to be re-aimed as the sections above it
  // settle, and an animation still in flight leaves nothing to re-aim against —
  // scrollTop sits between the two positions, which reads exactly like the
  // parent having scrolled the pane themselves.
  function jumpBehavior(): ScrollBehavior {
    if (!fullyMounted) return 'auto';
    return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  }

  function spiedSectionAt(pane: HTMLElement): SectionId {
    // The end of the scroll only means the last section once every section is in
    // the pane; while they are still arriving it is just the end of what has
    // arrived, and electing About there would strobe the highlight down the
    // column on open.
    const atScrollEnd =
      pane.scrollTop + pane.clientHeight >= pane.scrollHeight - SCROLL_END_EPSILON_PX;
    if (fullyMounted && atScrollEnd) {
      return SECTIONS[SECTIONS.length - 1].id;
    }
    const line = pane.getBoundingClientRect().top + SCROLLSPY_LINE_INSET_PX * visualScale(pane);
    let current: SectionId = SECTIONS[0].id;
    for (const section of SECTIONS) {
      const el = sectionEls[section.id];
      if (el && el.getBoundingClientRect().top <= line) current = section.id;
    }
    return current;
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

  // Arithmetic on each scroller's own scrollTop, never `scrollIntoView`: that
  // method scrolls *every* scrollable ancestor, and the card, the split and the
  // dialog are all clipped boxes. Dividing the rect delta by the scroller's
  // visual scale lands the arithmetic in layout pixels, so neither the fly-in's
  // transform nor a pinch-zoomed pane skews where the scroll ends up.
  function scrollToSection(id: SectionId, behavior: ScrollBehavior) {
    const el = sectionEls[id];
    const pane = paneEl;
    if (!el || !pane) return;
    if (behavior === 'smooth') smoothJumpTarget = id;
    const offset =
      (el.getBoundingClientRect().top - pane.getBoundingClientRect().top) / visualScale(pane);
    pane.scrollTo({ top: pane.scrollTop + offset - SECTION_JUMP_INSET_PX, behavior });
  }

  // The pane's scroll elects the highlight now, so — unlike a click, which can
  // only land on a row already on screen — the spied row can be one the parent
  // never scrolled the nav to. Wherever the list outgrows its column, that
  // leaves the table of contents showing no highlight at all.
  function revealNavRow(id: SectionId, behavior: ScrollBehavior) {
    const nav = navEl;
    const row = nav?.querySelector<HTMLElement>(`[data-section="${id}"]`);
    if (!nav || !row) return;
    const scale = visualScale(nav);
    const navRect = nav.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const clearance = NAV_ROW_CLEARANCE_PX * scale;
    const above = navRect.top + clearance - rowRect.top;
    const below = rowRect.bottom - (navRect.bottom - clearance);
    if (above <= 0 && below <= 0) return;
    const shift = above > 0 ? -above : below;
    nav.scrollTo({ top: nav.scrollTop + shift / scale, behavior });
  }

  // The dialog is closed, never unmounted, so both the nav and the pane keep the
  // offsets the parent left them at — which would reopen with the landing
  // section highlighted while the pane still shows wherever they stopped
  // reading. A deep-linked section scrolls into place instead of swapping in.
  $effect(() => {
    if (!settingsModal.open) return;
    const landing = landingSection;
    // Landing on Parent Center is only ever requested by a solved challenge (the
    // gate's own way into the policy editor), so that landing arrives already
    // unlocked — asking again for the section the solve was spent on would make
    // the solve worthless. Every other landing re-locks.
    parentCenterUnlocked = landing === 'parentCenter';
    markDisplayedSectionSeen(landing);
    spiedSection = landing;
    // A section's offset depends only on what stacks above it, so mounting the
    // run up to the landing section is what makes the landing scroll below land
    // on a true offset. For the default landing that is one section; a deep link
    // pays for its own prefix.
    mountAtLeast(sectionIndex(landing) + 1);
    let stopFill: (() => void) | undefined;
    // A still-closed dialog is `display: none`, so both scrollers report 0 and
    // ignore a scrollTo — and the browser then restores the offsets it kept the
    // moment the card gets a layout box. Waiting a frame is what makes the reset
    // stick rather than be overwritten.
    const frame = requestAnimationFrame(() => {
      navEl?.scrollTo({ top: 0 });
      revealNavRow(landing, 'auto');
      // A deep-linked landing is a jump like any other, and pays the same way:
      // the sections above it are still arriving when this scroll is computed.
      if (!fullyMounted) pendingJump = landing;
      scrollToSection(landing, 'auto');
      stopFill = fillAfterFlyIn();
    });
    return () => {
      cancelAnimationFrame(frame);
      stopFill?.();
    };
  });

  // The last word on a pending jump, and the end of it. Until the pane is whole
  // there may not be enough content below the target to scroll it into place at
  // all — the arithmetic is right and the scroll lands clamped — so the jump
  // gets one final aim at the moment the extent exists. From here the scroll
  // position belongs to whoever moves it next.
  $effect(() => {
    if (!fullyMounted || !pendingJump) return;
    scrollToSection(pendingJump, 'auto');
    pendingJump = null;
  });

  $effect(() => {
    const pane = paneEl;
    const content = zoomTarget;
    if (!pane || !content) return;
    let frame = 0;
    const spy = () => {
      frame = 0;
      const next = spiedSectionAt(pane);
      const smoothJump = smoothJumpTarget;
      if (next === smoothJump) smoothJumpTarget = null;
      // Not just a dedupe: the reveal below fires on an election change only, so
      // a parent who scrolls the column by hand keeps the position they chose
      // until the reading position moves to another section. Revealing on every
      // tick would yank the column back out from under them mid-gesture.
      if (next === spiedSection) return;
      if (!smoothJump) markDisplayedSectionSeen(next);
      spiedSection = next;
      revealNavRow(next, jumpBehavior());
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(spy);
    };
    pane.addEventListener('scroll', schedule, { passive: true });
    // A conditional reveal inside a section (volume slider, advanced controls,
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
    // has to exist before there is an offset to scroll to.
    if (mountAtLeast(sectionIndex(id) + 1)) await tick();
    const behavior = jumpBehavior();
    // Only a mid-fill jump is left pending: on a whole pane the offsets this
    // reads are already final, and re-aiming later would fight the parent's own
    // scrolling instead of the fill.
    const hold = !fullyMounted;
    if (id !== 'parentCenter' || parentCenterRevealed) {
      markSectionSeen(id);
      if (hold) pendingJump = id;
      scrollToSection(id, behavior);
      return;
    }
    unlockParentCenter(trigger, () => {
      if (hold) pendingJump = id;
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
  <div
    class="settings-pane"
    aria-busy={!fullyMounted}
    use:pinchTextZoom={textZoom}
    bind:this={paneEl}
  >
    <div class="settings-zoom" bind:this={zoomTarget}>
      {#each mountedSections as section (section.id)}
        <section
          class="settings-section"
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
            <SectionBody
              id={section.id}
              open={settingsModal.open}
              onSettled={() => (stagedContentSettled = true)}
            />
          {/if}
        </section>
      {/each}
    </div>
    <!-- Outside the zoom target: the cue is pane chrome, so it keeps its own
         size while the reading content scales under it, and its sentinel still
         marks the end of however tall that content has become. -->
    <ScrollCue />
  </div>
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

  .settings-pane-title {
    margin: 0 0 20px 0;
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    color: var(--text-strong);
  }
</style>
