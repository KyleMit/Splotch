import { untrack } from 'svelte';
import { scheduleIdle } from '$lib/idle';
import { settingsModal } from '$lib/state/ui.svelte';

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

// The wide Settings pane's staged fill, as two watermarks over its stacking
// order: how many sections, from the first, exist, and how many of those are
// painted. `openingCount` is what an open tap constructs in its own task.
export function createStagedSections(total: number, openingCount: number) {
  // How many sections, from the first, currently exist in the pane. Mounted on
  // an open tap it starts at the above-the-fold prefix — the opening tap is
  // itself the first frame; mounted closed by the idle pump it starts empty, so
  // every prewarm slice is one section's construction and nothing more (the
  // physical-iPad idle gate scores each slice as a frame). A watermark, never
  // lowered: the dialog is closed rather than unmounted, so a reopen keeps
  // whatever the last open finished mounting and pays nothing again.
  let mountedCount = $state(settingsModal.open ? openingCount : 0);

  // How many sections, from the first, are *presented* — painted rather than
  // merely laid out. Layout must be whole for the scrollspy and jump
  // arithmetic (a section is laid out in full or not in the pane at all), but
  // paint is stageable: revealing the entire prewarmed pane on the open edge
  // put its whole first paint inside the fly-in's frames, which the physical
  // iPad scored at 33 ms P95 against the 20 ms gate. Sections at or past this
  // count keep their geometry and lose only their pixels (visibility), so
  // presentation can stage per frame the way the mount fill always has —
  // that staged path scored 17 ms P95 on the same device. Zero while closed,
  // deliberately: presenting even the fold in the frame that shows the dialog
  // stacked its paint on showModal's own work and kept that frame over the
  // gate, so the open's flip carries no paint at all and the fold arrives one
  // frame later — inside the fly-in's first moments, where the card is still
  // near its launch-button scale.
  let presentedCount = $state(0);

  // Attaching the last section is not the same as the pane being whole. What's
  // New reveals its release-note blocks over frames of its own — ADR-0061 chose
  // that after measuring 43-47ms for mounting them together on desktop WebKit —
  // so the pane goes on growing behind a wrapper that is already in. Waiting for
  // it too is what keeps `fullyMounted` a true statement rather than a nearly
  // true one, and the shell's scroll-end election depends on that being exact.
  // One flag because one section stages; a second would make this a count.
  let stagedContentSettled = $state(false);
  const fullyMounted = $derived(mountedCount >= total && stagedContentSettled);

  // Raise the watermark to cover `count` sections, reporting whether anything
  // new is on its way in. The read is untracked so the frame pump and the click
  // handler that call this can't re-enter the effect they were started from.
  function mountAtLeast(count: number): boolean {
    const next = Math.min(count, total);
    if (untrack(() => mountedCount) >= next) return false;
    mountedCount = next;
    return true;
  }

  // Presenting implies existing: raising the presentation watermark mounts the
  // run first, so the two counters cannot disagree about a section's state.
  function presentAtLeast(count: number): boolean {
    const next = Math.min(count, total);
    mountAtLeast(next);
    if (untrack(() => presentedCount) >= next) return false;
    presentedCount = next;
    return true;
  }

  // Presentation, unlike mounting, does come down: all at once here, on the
  // shell's open transition, and a section per idle slice in the closed restage
  // below.
  function resetPresentation() {
    presentedCount = 0;
  }

  function markStagedContentSettled() {
    stagedContentSettled = true;
  }

  // The card flies in over its own run of frames, and the fill would otherwise
  // spend them: a section body too big to construct inside one frame drops one
  // of the animation's. So the fill waits for the card to land — nothing may
  // read the pane before then anyway, which is what `aria-busy` states. A
  // cancelled animation rejects `finished`; that leaves nothing to wait for,
  // which is the same answer as landing. `flyIn` is the dialog's running
  // animations, read by the caller at the moment the fill starts.
  function fillAfterFlyIn(flyIn: readonly Animation[]): () => void {
    let stopPump: (() => void) | undefined;
    let cancelled = false;
    void Promise.all(flyIn.map((animation) => animation.finished.catch(() => undefined))).then(
      () => {
        if (cancelled) return;
        // One frame of air between the animation's end and the first reveal:
        // animationend's own style/compositor cleanup shares the resolution
        // frame, and stacking the heaviest section's first paint on top of it is
        // what pushed that frame past the physical iPad's max-frame gate.
        const breather = requestAnimationFrame(() => {
          if (!cancelled) stopPump = pumpRemainingSections();
        });
        stopPump = () => cancelAnimationFrame(breather);
      }
    );
    return () => {
      cancelled = true;
      stopPump?.();
    };
  }

  // Each frame asks for one more than the watermark currently holds, rather than
  // counting up privately: a jump can raise the watermark mid-fill, and a
  // private counter would then find nothing left to do and stop the fill for
  // good, stranding every section below the one that was jumped to. Driven by
  // the presentation watermark, which mounts what it needs on the way: on a tap
  // that beat the prewarm each step constructs and paints one section, and on a
  // prewarmed pane each step is one section's reveal.
  function pumpRemainingSections(): () => void {
    let frame = 0;
    const presentNext = () => {
      const next = untrack(() => presentedCount) + SECTIONS_PER_FRAME;
      frame = presentAtLeast(next) ? requestAnimationFrame(presentNext) : 0;
    };
    frame = requestAnimationFrame(presentNext);
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }

  // The closed dialog's two idle effects. A method rather than part of
  // construction so the owning component creates them at its chosen place in
  // its own effect order: Svelte defers a component's init-time `$effect`s and
  // creates them in call order. Call it during component initialisation.
  function stageWhileClosed() {
    // The dialog mounts closed in the idle pump's last slice (ADR-0049), so the
    // idle time before a first open pays for the rest of the pane: one section
    // per idle slice, the open-time fill's own shape on the idle scheduler
    // instead of frames. A first open after this finds every section mounted and
    // pays what a reopen pays. The moment the dialog opens, the open path owns
    // the fill — this effect re-runs and cancels its pending slice. Reading
    // `mountedCount` (tracked) is what re-arms the next slice after each mount.
    $effect(() => {
      if (settingsModal.open || mountedCount >= total) return;
      return scheduleIdle(() => mountAtLeast(untrack(() => mountedCount) + 1));
    });

    // After a close, presentation returns to its closed steady state — every
    // section staged — one section per idle slice. Re-hiding on the close frame
    // itself is what the physical iPad's close gate scored (21 ms P95); at idle
    // each re-hide is one small restyle, and the next open's flip then carries
    // no paint at all.
    $effect(() => {
      if (settingsModal.open || presentedCount <= 0) return;
      return scheduleIdle(() => {
        presentedCount = Math.max(0, untrack(() => presentedCount) - 1);
      });
    });
  }

  return {
    get mountedCount() {
      return mountedCount;
    },
    get presentedCount() {
      return presentedCount;
    },
    get fullyMounted() {
      return fullyMounted;
    },
    mountAtLeast,
    presentAtLeast,
    resetPresentation,
    markStagedContentSettled,
    fillAfterFlyIn,
    stageWhileClosed,
  };
}
