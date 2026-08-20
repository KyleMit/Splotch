<script lang="ts">
  import { onMount } from 'svelte';
  import { getAcceptRadius } from '$lib/actions/dragToClearGeometry';
  import Icon from './Icon.svelte';

  const COACHMARK_AUTO_DISMISS_MS = 6000;
  // Overshoot past the ring edge so the mime reads "pull past the threshold, not just to it".
  const GHOST_TRAVEL_OVERSHOOT = 1.18;

  let coachmarkRingEl: HTMLDivElement;
  let coachmarkGhostEl: HTMLDivElement;

  let tutorialVisible = $state(false);

  // Untracked on purpose: a timer handle, nothing renders from it.
  let tutorialDismissTimer: ReturnType<typeof setTimeout> | null = null;

  export function show(anchorEl: HTMLElement) {
    if (tutorialVisible) return;
    if (!anchorEl || !coachmarkRingEl || !coachmarkGhostEl) return;

    // Anchor the coachmark to the button's live home position so it survives
    // orientation/layout changes between sessions.
    const rect = anchorEl.getBoundingClientRect();
    const cx = (rect.left + rect.right) / 2;
    const cy = (rect.top + rect.bottom) / 2;
    const radius = getAcceptRadius();

    // Faint preview of the real accept-zone ring, centered on the button.
    coachmarkRingEl.style.left = `${cx - radius}px`;
    coachmarkRingEl.style.top = `${cy - radius}px`;
    coachmarkRingEl.style.width = `${radius * 2}px`;
    coachmarkRingEl.style.height = `${radius * 2}px`;

    // Ghost button + hand start on the real button and drag down-left toward
    // the canvas.
    const travel = radius * GHOST_TRAVEL_OVERSHOOT;
    coachmarkGhostEl.style.left = `${cx - rect.width / 2}px`;
    coachmarkGhostEl.style.top = `${cy - rect.height / 2}px`;
    coachmarkGhostEl.style.width = `${rect.width}px`;
    coachmarkGhostEl.style.height = `${rect.height}px`;
    coachmarkGhostEl.style.setProperty('--tx', `${-travel * Math.SQRT1_2}px`);
    coachmarkGhostEl.style.setProperty('--ty', `${travel * Math.SQRT1_2}px`);

    // The loop runs free while hidden, so restart it from frame 0 — otherwise
    // it can appear mid-cycle (e.g. already at the finish position).
    for (const el of [coachmarkGhostEl, coachmarkRingEl]) {
      el.style.animation = 'none';
      void el.offsetWidth; // force reflow so the restart takes effect
      el.style.animation = '';
    }

    tutorialVisible = true;
    tutorialDismissTimer = setTimeout(dismiss, COACHMARK_AUTO_DISMISS_MS);
  }

  // Safe to call unconditionally, so callers never have to read this
  // component's visibility state to decide whether a dismiss is needed.
  export function dismiss() {
    if (!tutorialVisible) return;
    if (tutorialDismissTimer) {
      clearTimeout(tutorialDismissTimer);
      tutorialDismissTimer = null;
    }
    tutorialVisible = false;
  }

  onMount(() => {
    return () => {
      if (tutorialDismissTimer) clearTimeout(tutorialDismissTimer);
    };
  });
</script>

<!-- Animated coachmark: a ghost button + hand mimes the drag-to-clear gesture. -->
<div class="clear-coachmark" class:visible={tutorialVisible} aria-hidden="true">
  <div class="coachmark-ring" bind:this={coachmarkRingEl}></div>
  <div class="coachmark-ghost" bind:this={coachmarkGhostEl}>
    <div class="coachmark-button">
      <Icon name="trash-open" class="coachmark-trash" aria-hidden="true" />
    </div>
    <Icon name="swipe-down" class="coachmark-hand" aria-hidden="true" />
  </div>
</div>

<style>
  /* Animated coachmark — a gentle, looping demo of the drag-to-clear gesture.
     The full-screen container only handles fade in/out; the ring and ghost are
     positioned imperatively in viewport coords (see show). */
  .clear-coachmark {
    position: fixed;
    inset: 0;
    z-index: var(--z-clear-coachmark); /* Above the real button so the ghost is always visible */
    pointer-events: none; /* Never blocks the real button underneath */
    opacity: 0;
    visibility: hidden;
    /* Hint coral (dashed, inviting) for .coachmark-ring's base + early
       keyframe frames. */
    --hint-rgb: 255, 107, 107;
    /* Settled "ready" rose (solid, alarm-adjacent) — one pair of whole-value
       properties so the coachmarkRing keyframe's 70%,86% frame and the
       reduced-motion fallback below read the exact same border/fill and
       cannot drift apart. */
    --ready-rgb: 238, 90, 111;
    --ready-border: rgba(var(--ready-rgb), 0.85);
    --ready-fill: radial-gradient(
      circle,
      rgba(var(--ready-rgb), 0) 50%,
      rgba(var(--ready-rgb), 0.18) 100%
    );
    transition:
      opacity 0.4s ease,
      visibility 0.4s;
  }

  .clear-coachmark.visible {
    opacity: 1;
    visibility: visible;
  }

  /* Soft preview of the accept zone — uses the friendlier coral, not the
     alarm-red of the live threshold, so the hint reads as an invitation. */
  .coachmark-ring {
    position: fixed;
    box-sizing: border-box;
    border-radius: 50%;
    border: 4px dashed rgba(var(--hint-rgb), 0.4);
    background: radial-gradient(
      circle,
      rgba(var(--hint-rgb), 0) 60%,
      rgba(var(--hint-rgb), 0.05) 100%
    );
    animation: coachmarkRing 2.8s ease-in-out infinite;
  }

  .coachmark-ghost {
    position: fixed;
    animation: coachmarkDrag 2.8s ease-in-out infinite;
    will-change: transform, opacity;
  }

  .coachmark-button {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: var(--clear-gradient-rest);
    box-shadow: -6px 6px 24px rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* :global() — this class lands on Icon.svelte's own <span>, which carries
     Icon's style-scope hash, not this component's, so a scoped selector here
     would never match. */
  :global(.coachmark-trash) {
    width: 45px;
    height: 45px;
    display: block;
  }

  /* Hand rests on the lower-right of the ghost button, like a fingertip. */
  :global(.coachmark-hand) {
    position: absolute;
    left: 58%;
    top: 52%;
    width: 52px;
    height: 52px;
    filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.3));
  }

  /* The mime plays over the paper, not a modal shell, so nothing re-inks it
     there — left at its baked near-black fill the hand's outlines disappear
     into the dark paper. --icon-ink is that same near-black in light mode, so
     this only changes what dark mode draws. */
  :global(.coachmark-hand svg) {
    fill: var(--icon-ink);
  }

  /* Ghost peels off the real button, drags to the ring edge, gives a little
     release pop, then fades. The flat tail (90–100%) is the pause between loops. */
  @keyframes coachmarkDrag {
    0% {
      transform: translate(0, 0) scale(1);
      opacity: 0;
    }
    8% {
      transform: translate(0, 0) scale(1);
      opacity: 1;
    }
    16% {
      transform: translate(0, 0) scale(0.94);
      opacity: 1;
    }
    58% {
      transform: translate(var(--tx), var(--ty)) scale(0.94);
      opacity: 1;
    }
    70% {
      transform: translate(var(--tx), var(--ty)) scale(0.94);
      opacity: 1;
    }
    80% {
      transform: translate(var(--tx), var(--ty)) scale(1.05);
      opacity: 1;
    }
    90% {
      transform: translate(var(--tx), var(--ty)) scale(1.08);
      opacity: 0;
    }
    100% {
      transform: translate(var(--tx), var(--ty)) scale(1);
      opacity: 0;
    }
  }

  /* Ring fades in, then snaps to a confirmed "ready" state as the ghost lands. */
  @keyframes coachmarkRing {
    0%,
    8% {
      opacity: 0;
      transform: scale(0.9);
      border-color: rgba(var(--hint-rgb), 0.4);
      border-style: dashed;
    }
    18% {
      opacity: 1;
      transform: scale(1);
    }
    57% {
      opacity: 1;
      transform: scale(1);
      border-color: rgba(var(--hint-rgb), 0.4);
      border-style: dashed;
      background: radial-gradient(
        circle,
        rgba(var(--hint-rgb), 0) 60%,
        rgba(var(--hint-rgb), 0.05) 100%
      );
    }
    70%,
    86% {
      opacity: 1;
      transform: scale(1.015);
      border-color: var(--ready-border);
      border-style: solid;
      background: var(--ready-fill);
    }
    94%,
    100% {
      opacity: 0;
    }
  }

  /* Respect reduced-motion: drop the loop, show a single static "here's the
     gesture" frame instead. */
  @media (prefers-reduced-motion: reduce) {
    .coachmark-ghost {
      animation: none;
      transform: translate(var(--tx), var(--ty));
      opacity: 0.95;
    }
    .coachmark-ring {
      animation: none;
      opacity: 1;
      border-color: var(--ready-border);
      border-style: solid;
      background: var(--ready-fill);
    }
  }
</style>
