<script lang="ts" module>
  import type { CommonIconName } from '../iconTypes';

  export interface SegmentedPickerOption<T extends string> {
    value: T;
    label: string;
    icon?: CommonIconName;
    disabled?: boolean;
    /** Stable DOM id — E2E tests target options through these. */
    id?: string;
  }
</script>

<script lang="ts" generics="T extends string">
  import Icon from '../Icon.svelte';
  import '$lib/components/deferredIcons';
  import { arrowDelta, nextEnabledIndex, rovingTabIndex } from './rovingRadio';
  import { createSegmentThumb } from './segmentThumb.svelte';

  // Design-system picker primitive: the one owner of the selected-state
  // control pattern Button deliberately excludes — those are pickers, not
  // actions. Two skins share the option machinery: the segmented
  // track with a raised brand-filled thumb, and the borderless
  // toggle chips. Selection *semantics* stay with the caller: onSelect always fires
  // with the clicked value, so a radio caller sets it, while a toggle caller
  // may flip it in a set (the chips).
  interface Props {
    /** Accessible name for the option group. */
    label: string;
    /** Visible explanatory copy associated with this picker. */
    describedBy?: string;
    options: SegmentedPickerOption<T>[];
    /**
     * The active value (or null when none is), or — for independent toggles
     * like the controls chips — the pressed subset.
     */
    selected: T | null | readonly T[];
    onSelect: (value: T) => void;
    /** radio = choose-one (radiogroup/aria-checked); toggle = pressable options (group/aria-pressed). */
    mode?: 'radio' | 'toggle';
    /**
     * Renders each option as a real `<input type="radio">` under this name
     * instead of a button, for a form that must submit with JavaScript
     * unavailable. radio mode only: the native radios carry the checked state
     * and arrow-key roving themselves, and the group's radiogroup role is what
     * gives them the accessible name grouping by `name` alone leaves them
     * without.
     */
    inputName?: string;
    /**
     * segment = brand-filled thumb track; chip = borderless toggle grid; underline =
     * tab row on a hairline, for a standalone page that switches between two
     * views of itself rather than setting something. `underline` manages its own
     * width: it hugs the left on a sheet and splits the row evenly on a phone,
     * so `fill` does not apply to it (see the style block).
     */
    variant?: 'segment' | 'chip' | 'underline';
    /**
     * 'collapsible' lets a caller hide the option labels at a breakpoint of its
     * own choosing — the picker does not decide *when*, which is a layout
     * question only the caller can answer; it makes the collapse safe. The
     * option's visible text is otherwise its accessible name, so a caller
     * hiding it with its own CSS would be left with unnamed controls.
     */
    labels?: 'always' | 'collapsible';
    /** false = the track hugs its content instead of stretching full-width. */
    fill?: boolean;
    /** Forwarded to the track so a call site can restyle via `:global()`. */
    class?: string;
  }

  let {
    label,
    describedBy,
    options,
    selected,
    onSelect,
    mode = 'radio',
    inputName,
    variant = 'segment',
    labels = 'always',
    fill = true,
    class: className,
  }: Props = $props();

  function isSelected(value: T): boolean {
    return Array.isArray(selected) ? selected.includes(value) : selected === value;
  }

  // Element refs for the roving focus moves below and the thumb's measurement —
  // deliberately untracked, nothing renders from them.
  const optionEls: HTMLElement[] = [];
  let trackEl: HTMLDivElement | undefined = $state();

  // No thumb without exactly one selection — the orientation segment can
  // release to null, and toggle chips pass a subset.
  const thumbIndex = $derived(
    variant === 'segment' && !Array.isArray(selected) && selected !== null
      ? options.findIndex((option) => option.value === selected)
      : -1
  );
  const thumb = createSegmentThumb({
    track: () => trackEl,
    cells: optionEls,
    index: () => thumbIndex,
  });

  const rovingIndex = $derived(rovingTabIndex(options, isSelected));

  function moveWithArrow(event: KeyboardEvent, from: number) {
    const delta = arrowDelta(event.key);
    if (delta === 0) return;
    event.preventDefault();
    const next = nextEnabledIndex(options, from, delta);
    onSelect(options[next].value);
    optionEls[next]?.focus();
  }
</script>

<div
  class={[
    'picker',
    variant,
    fill && 'fill',
    labels === 'collapsible' && 'collapsible',
    thumb.travels && 'thumb-travels',
    className,
  ]}
  role={mode === 'radio' ? 'radiogroup' : 'group'}
  aria-label={label}
  aria-describedby={describedBy}
  style:--thumb-x={thumbIndex === -1 ? undefined : `${thumb.x}px`}
  style:--thumb-width={thumbIndex === -1 ? undefined : `${thumb.width}px`}
  bind:this={trackEl}
>
  {#if thumbIndex !== -1}
    <span class="thumb" aria-hidden="true"></span>
  {/if}
  <!-- Both branches carry aria-label: an option's name would otherwise come from
     its visible text — the button's own content, the wrapping label's content
     for a native radio — which is exactly the text `labels="collapsible"` lets
     a caller hide. Naming the control instead costs the collapse the label and
     never the name. -->
  {#each options as option, index (option.value)}
    {@const active = isSelected(option.value)}
    {#if inputName}
      <label class="option" class:active id={option.id} bind:this={optionEls[index]}>
        <input
          type="radio"
          name={inputName}
          value={option.value}
          checked={active}
          disabled={option.disabled}
          aria-label={option.label}
          onchange={() => onSelect(option.value)}
        />
        {@render optionBody(option, active)}
      </label>
    {:else}
      <button
        type="button"
        class="option"
        class:active
        id={option.id}
        disabled={option.disabled}
        aria-label={option.label}
        role={mode === 'radio' ? 'radio' : undefined}
        aria-checked={mode === 'radio' ? active : undefined}
        aria-pressed={mode === 'toggle' ? active : undefined}
        tabindex={mode === 'radio' ? (index === rovingIndex ? 0 : -1) : undefined}
        onclick={() => onSelect(option.value)}
        onkeydown={mode === 'radio' ? (event) => moveWithArrow(event, index) : undefined}
        bind:this={optionEls[index]}
      >
        {@render optionBody(option, active)}
      </button>
    {/if}
  {/each}
</div>

{#snippet optionBody(option: SegmentedPickerOption<T>, active: boolean)}
  {#if option.icon}
    <Icon name={option.icon} class="picker-option-icon" />
  {/if}
  <span class="option-label">{option.label}</span>
  {#if variant === 'chip'}
    <!-- The check is an icon rather than a "✓" glyph: U+2713 sits outside the
         Quicksand subsets and rendered in the OS fallback face. The span keeps
         its width while empty so labels do not shift when a chip toggles. -->
    <span class="option-check" aria-hidden="true">
      {#if active}<Icon name="check" class="option-check-icon" />{/if}
    </span>
  {/if}
{/snippet}

<style>
  .option {
    /* Contains the visually-hidden input below. Without it the input's
       containing block is whatever distant ancestor is positioned, so its
       static position resolves against *that* box — unaffected by any scroller
       in between. Deep in a scrolled pane the input then sits a full scrollTop
       away from the option a parent just clicked, and the browser scrolling
       that focused input into view drags the whole panel off screen — the
       settings card went blank on the feedback picker. Pinned by "choosing a
       feedback kind leaves the settings panel where it was" in
       web/tests/flows-settings.spec.ts. */
    position: relative;
    border: none;
    background: transparent;
    color: var(--text-soft);
    font-family: inherit;
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    touch-action: manipulation;
  }

  .option:disabled {
    cursor: not-allowed;
    opacity: var(--disabled-opacity);
  }

  /* app.css targets .picker .option for the visible keyboard ring;
     design-foundations.spec.ts exercises focus through the hidden input.
     In the native-radio skin the input is the accessible control and the option
     is its skin. Hidden without display:none / visibility:hidden, both of which
     would take it out of the a11y tree and off the focus path. */
  .option input {
    position: absolute;
    /* Pinned to the corner rather than left at its static position, which is the
       centre of a flex-centred option — the one pixel a click aimed at the
       option's label lands on. */
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    opacity: 0;
    margin: 0;
  }

  /* The picker owns its icon ink (the modal shell's re-ink rule only reaches
     icons inside a modal, and pickers also render on plain surfaces). */
  .picker :global(.picker-option-icon svg) {
    fill: var(--icon-ink);
  }

  /* Segmented track with a raised brand-filled thumb. Callers restyle it
     through the --segment-* custom properties, set on the element they forward
     through `class` or on any ancestor, never by selecting this component's
     internal classes: the Orientation picker stacks each icon above its label
     through the option direction, gap, and padding, and the compact settings
     shell matches the track to its cell through the two radii. */
  .segment {
    /* Past --duration-base so the travel reads as a glide between cells rather
       than a jump, and inside a toddler's second tap. */
    --thumb-travel-duration: 220ms;
    /* The thumb's containing block, so option offsets measure from here. */
    position: relative;
    display: inline-flex;
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--control-track);
    border-radius: var(--segment-track-radius, var(--radius-md));
  }

  .segment.fill {
    display: flex;
  }

  .segment .option {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-direction: var(--segment-option-direction, row);
    color: var(--text);
    gap: var(--segment-option-gap, 6px);
    min-height: 44px;
    padding: var(--segment-option-padding, var(--space-2) var(--space-1));
    font-size: var(--font-size-sm);
    line-height: 1.2;
    /* Concentric with the track: --radius-md outer minus the --space-1 inset. */
    border-radius: var(--segment-option-radius, var(--radius-sm));
    transition: color var(--duration-fast) ease;
  }

  /* Painted first, so every option — relatively positioned above — sits on it.
     Inset like the options, and on their radius, so it reads as the cell. */
  .segment .thumb {
    position: absolute;
    top: var(--space-1);
    bottom: var(--space-1);
    left: 0;
    width: var(--thumb-width, 0);
    border-radius: var(--segment-option-radius, var(--radius-sm));
    background: var(--brand-solid);
    box-shadow: var(--shadow-control);
    transform: translateX(var(--thumb-x, 0));
    pointer-events: none;
  }

  .segment.thumb-travels .thumb {
    transition:
      transform var(--thumb-travel-duration) var(--ease-glide),
      width var(--thumb-travel-duration) var(--ease-glide);
  }

  /* Exactly ToggleSwitch's calm twin: a state change snaps. */
  :global(:root[data-reduce-motion]) .segment .thumb {
    transition: none;
  }

  .segment.fill .option {
    flex: 1;
    min-width: 0;
  }

  /* A hugging track's options carry their own horizontal room instead of flexing. */
  .segment:not(.fill) .option {
    padding: var(--space-2) 14px;
  }

  /* Collapsed, an option is a square rather than a shrunken pill: the label is
     what gave it width, and the touch-target floor is what's left. The caller
     hides .option-label at a width it chooses; this keeps the target legal
     when it does. */
  .segment.collapsible .option {
    min-width: 44px;
  }

  @media (hover: hover) {
    .segment .option:not(.active):hover {
      color: var(--text-strong);
    }
  }

  .segment .option.active {
    color: var(--on-brand);
  }

  .segment :global(.picker-option-icon) {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  /* Underline tabs: one hairline under a row of labels, the live one carrying a
     brand segment of it. The other two skins are controls that sit on a page;
     this one is the page's own furniture, which is why it brings a rule rather
     than a track — it says "two views of this page", where a track says "a
     setting". Its icons follow the label ink instead of --icon-ink, so the live
     tab moves as one mark. */
  .underline {
    /* Thicker than the rule it replaces, so the mark reads from across the row
       — the weight SidebarToc's live rail segment already uses. */
    --underline-segment-width: 3px;

    display: flex;
    gap: 28px;
    border-bottom: var(--border-width) solid var(--border);
  }

  .underline .option {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    /* The interaction-target floor is a property of the control, not of the
       viewport: a touch-capable tablet sits above the phone step and still gets
       fingers. Padding alone leaves the box a pixel short of it. */
    min-height: 44px;
    padding: 9px 2px 11px;
    /* Sits ON the rule rather than under it, so the live segment replaces that
       stretch of hairline instead of doubling it. */
    margin-bottom: calc(-1 * var(--border-width));
    border-bottom: var(--underline-segment-width) solid transparent;
    font-size: var(--font-size-md);
    line-height: 1.25;
    transition:
      color var(--duration-fast) ease,
      border-color var(--duration-fast) ease;
  }

  /* The ramp's accessible step, and the identity hue for the segment beneath it
     — the same pairing SidebarToc marks its live row with. */
  .underline .option.active {
    color: var(--brand-text);
    border-bottom-color: var(--brand);
  }

  .underline :global(.picker-option-icon) {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .underline :global(.picker-option-icon svg) {
    fill: currentColor;
  }

  @media (hover: hover) {
    .underline .option:not(.active):hover {
      color: var(--text-strong);
    }
  }

  /* Phone: the sheet has given up its own edges (PageShell), so the row does
     too — the cells split the width evenly and each live segment is a whole
     cell, which is what makes the row read as a two-position switch. The caller
     supplies the bleed past the page gutter; this only divides what it is given.
     `fill` is deliberately not consulted: the width behavior is the variant's,
     not a prop for a call site to get wrong. Restates PHONE_MAX_WIDTH_PX
     (lib/breakpoints.ts) — a media query cannot import it, and phoneStep.test.ts
     fails when this and PageShell's step disagree. */
  @media (max-width: 540px) {
    .underline {
      gap: 0;
    }

    .underline .option {
      flex: 1 1 0;
      min-width: 0;
    }
  }

  /* Borderless toggle chips in a two-column grid — the independent-toggles
     skin. No hairline: an unselected chip rests on the same recessed
     --control-track the segment variant's track uses, which reads as its own
     surface without one and leaves the whole chip box for the icon instead of
     spending it on the border and its inset. */
  .chip {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .chip .option {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 11px 12px;
    border-radius: var(--radius-md);
    background: var(--control-track);
    font-size: var(--font-size-sm);
    transition:
      background var(--duration-fast) ease,
      color var(--duration-fast) ease;
  }

  @media (hover: hover) {
    .chip .option:not(.active):hover {
      background: var(--control-track-hover);
      color: var(--text-strong);
    }
  }

  /* --brand-solid, not --brand: the chip carries its label on this fill, and
     --brand is only 3.4:1 against --on-brand (fails WCAG AA at body size). */
  .chip .option.active {
    background: var(--brand-solid);
    color: var(--on-brand);
  }

  @media (hover: hover) {
    .chip .option.active:hover {
      background: var(--brand-solid-hover);
    }
  }

  /* Wraps instead of ellipsizing: the option name is what identifies the
     control, and an ellipsis leaves only the icon to carry it. Chips in a row
     stretch to the tallest, so a wrapped label doesn't ragged the grid. */
  .chip .option-label {
    flex: 1;
    min-width: 0;
    text-align: left;
    overflow-wrap: break-word;
  }

  .chip :global(.picker-option-icon) {
    width: 26px;
    height: 26px;
    flex-shrink: 0;
  }

  /* The chip's icon follows the chip ink so it flips to white when on. */
  .segment .option.active :global(.picker-option-icon svg),
  .chip .option.active :global(.picker-option-icon svg) {
    fill: var(--on-brand);
  }

  .option-check {
    flex-shrink: 0;
    display: inline-flex;
    justify-content: center;
    width: 14px;
  }

  .option-check :global(.option-check-icon) {
    width: 14px;
    height: 14px;
  }

  .option-check :global(.option-check-icon svg) {
    fill: currentColor;
  }
</style>
