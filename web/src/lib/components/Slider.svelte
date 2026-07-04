<script lang="ts">
  import { onDestroy } from 'svelte';

  // Relative-drag slider extracted from the Parent Center volume control so the
  // same touch/keyboard behaviour can back other settings (e.g. button size).
  // Grabbing anywhere on the bar and sliding moves the value by the distance
  // travelled, rather than jumping to the finger like a native range. Move/up are
  // tracked on window so the drag keeps following the finger even when it leaves
  // the bar (more reliable than setPointerCapture).
  interface Props {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    pageStep?: number;
    // id of the label element that names this slider (aria-labelledby).
    labelId: string;
    // Human-readable value for aria-valuetext (e.g. "50%").
    valueText: string;
    // Optional magnetic detent: while dragging, values within a small band of
    // this one stick to it, so the parent can land on the default without fuss.
    snap?: number;
    onInput: (value: number) => void;
    // Fired when a pointer drag or key adjustment begins/ends, so the caller can
    // run side effects for the duration (preview a sound, reveal the target, …).
    onActiveChange?: (active: boolean) => void;
  }

  let {
    value,
    min = 0,
    max = 100,
    step = 1,
    pageStep = 10,
    labelId,
    valueText,
    snap,
    onInput,
    onActiveChange,
  }: Props = $props();

  // Half-width of the snap band, in value units: ~4.5% of the track, so the
  // detent feels the same size on any range (0–100 volume or 70–130 size).
  const snapBand = $derived((max - min) * 0.045);

  let trackEl: HTMLDivElement;
  let dragPointerId: number | null = null;
  let dragStartX = 0;
  let dragStartValue = 0;
  let active = false;

  const fillPercent = $derived(((value - min) / (max - min)) * 100);

  function clamp(v: number) {
    return Math.round(Math.min(max, Math.max(min, v)));
  }

  function apply(next: number) {
    const clamped = clamp(next);
    if (clamped === value) return;
    onInput(clamped);
  }

  function setActive(next: boolean) {
    if (active === next) return;
    active = next;
    onActiveChange?.(next);
  }

  function onPointerDown(event: PointerEvent) {
    if (!event.isPrimary) return;
    dragPointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartValue = value;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    setActive(true);
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent) {
    if (dragPointerId !== event.pointerId) return;
    const width = trackEl?.clientWidth || 1;
    const deltaValue = ((event.clientX - dragStartX) / width) * (max - min);
    let next = dragStartValue + deltaValue;
    // Detent only on pointer drag — keyboard stepping must never get stuck at
    // the snap point (a single arrow key could otherwise be swallowed).
    if (snap != null && Math.abs(next - snap) <= snapBand) next = snap;
    apply(next);
    event.preventDefault();
  }

  function onPointerUp(event: PointerEvent) {
    if (dragPointerId !== event.pointerId) return;
    dragPointerId = null;
    removeWindowListeners();
    setActive(false);
  }

  function removeWindowListeners() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  }

  onDestroy(removeWindowListeners);

  function onKeyDown(event: KeyboardEvent) {
    let next = value;
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowDown':
        next -= step;
        break;
      case 'ArrowRight':
      case 'ArrowUp':
        next += step;
        break;
      case 'PageDown':
        next -= pageStep;
        break;
      case 'PageUp':
        next += pageStep;
        break;
      case 'Home':
        next = min;
        break;
      case 'End':
        next = max;
        break;
      default:
        return;
    }
    event.preventDefault();
    setActive(true);
    apply(next);
  }

  function onEnd() {
    setActive(false);
  }
</script>

<div
  class="slider"
  role="slider"
  tabindex="0"
  aria-labelledby={labelId}
  aria-valuemin={min}
  aria-valuemax={max}
  aria-valuenow={value}
  aria-valuetext={valueText}
  onpointerdown={onPointerDown}
  onkeydown={onKeyDown}
  onkeyup={onEnd}
  onblur={onEnd}
>
  <div class="slider-track" bind:this={trackEl}>
    <div class="slider-fill" style:width="{fillPercent}%"></div>
  </div>
</div>

<style>
  .slider {
    width: 100%;
    cursor: pointer;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
  }

  .slider:focus-visible {
    outline: none;
  }

  .slider:focus-visible .slider-track {
    outline: 3px solid var(--brand);
    outline-offset: 2px;
  }

  .slider-track {
    position: relative;
    width: 100%;
    height: 28px;
    border-radius: 999px;
    background: #e9e9e9;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.12);
    overflow: hidden;
  }

  .slider-fill {
    position: absolute;
    inset: 0 auto 0 0;
    height: 100%;
    border-radius: 999px;
    background: var(--brand);
  }
</style>
