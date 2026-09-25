<script lang="ts">
  import type { CommonIconName } from '../iconTypes';
  import SectionIcon from '../SectionIcon.svelte';
  import ToggleSwitch from './ToggleSwitch.svelte';
  import { SECTIONS, sectionSubtitle, type SectionId } from './sections';
  import { settingsState, setSound } from '$lib/state/settings.svelte';
  import { resolvedTheme, setResolvedTheme } from '$lib/state/appearance.svelte';
  import { hasSectionActivity } from '$lib/state/sectionsSeen.svelte';
  import '$lib/components/deferredIcons';

  interface Props {
    onopen: (id: SectionId, trigger: HTMLElement) => void;
  }
  let { onopen }: Props = $props();

  // A hub row answers its section inline, with a switch beside the drill-in,
  // only where the boolean is legible from the row's own name *and* worth
  // flipping mid-session. That is these two and no others: Auto-Save is
  // set-and-forget, and so is the tool drawer switch — a parent declutters the
  // drawer once, not per session. Night Mode is binary over the *resolved* theme — the same
  // quick toggle CompactShell and /design's header carry, with the same
  // accepted trade that flipping it while on System pins the preference; the
  // three-way choice including System stays in the Appearance section.
  interface HubToggle {
    id: string;
    label: string;
    checked: () => boolean;
    onToggle: (next: boolean) => void;
    /** Rides in the thumb where the switch has no label of its own beside it. */
    thumbIcon?: () => CommonIconName;
  }

  const HUB_TOGGLES: Partial<Record<SectionId, HubToggle>> = {
    appearance: {
      id: 'hubNightToggle',
      label: 'Night Mode',
      checked: () => resolvedTheme() === 'dark',
      onToggle: (next) => setResolvedTheme(next ? 'dark' : 'light'),
      thumbIcon: () => (resolvedTheme() === 'dark' ? 'theme-dark' : 'theme-light'),
    },
    sound: {
      id: 'hubSoundToggle',
      label: 'Sound',
      checked: () => settingsState.soundEnabled,
      onToggle: setSound,
    },
  };

  // The switch rows cluster at the top of the list, so the first row without one
  // opens the drill-ins and takes the extra gap that reads as a group break.
  const firstDrillIn = SECTIONS.findIndex((section) => !HUB_TOGGLES[section.id]);
  const groupBreakIndex = firstDrillIn > 0 ? firstDrillIn : -1;
</script>

<ul class="hub-list">
  {#each SECTIONS as section, index (section.id)}
    {@const toggle = HUB_TOGGLES[section.id]}
    {@const unseen = hasSectionActivity(section.id)}
    <li class:group-break={index === groupBreakIndex}>
      <div class="hub-tile">
        <button
          class="hub-row"
          data-section={section.id}
          onclick={(event) => onopen(section.id, event.currentTarget)}
        >
          <span class="hub-icon">
            <SectionIcon icon={section.icon} class="hub-icon-svg" />
            <span class="section-activity-dot" class:unseen></span>
          </span>
          <span class="hub-text">
            <span class="hub-title">{section.label}</span>
            <span class="hub-subtitle">{sectionSubtitle(section.id)}</span>
          </span>
          {#if unseen}<span class="visually-hidden">new</span>{/if}
        </button>
        {#if toggle}
          <span class="hub-action">
            <span class="hub-split"></span>
            <ToggleSwitch
              id={toggle.id}
              label={toggle.label}
              checked={toggle.checked()}
              onToggle={toggle.onToggle}
              thumbIcon={toggle.thumbIcon?.()}
            />
          </span>
        {/if}
      </div>
    </li>
  {/each}
</ul>

<style>
  .hub-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--setting-gap);
  }

  /* The two switch rows lead the list; this doubles the gap after them as the
     break between "flip it here" and "go configure". */
  .hub-list .group-break {
    margin-top: var(--setting-gap);
  }

  /* Android's split row: the body still drills in, and the trailing switch acts
     on the spot. The tile carries the surface so both halves sit on one card,
     with a hairline between them saying they are two targets. A row without a
     switch is the same tile with the body filling it. */
  .hub-tile {
    display: flex;
    align-items: center;
    border-radius: var(--radius-lg);
    background: var(--surface-2);
  }

  .hub-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex: 1;
    min-width: 0;
    padding: 16px;
    border: none;
    border-radius: var(--radius-lg);
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition:
      background var(--duration-fast) ease,
      transform var(--duration-fast) ease;
  }

  .hub-action {
    display: flex;
    align-items: center;
    gap: 14px;
    padding-right: 16px;
    flex-shrink: 0;
  }

  .hub-split {
    width: var(--border-width);
    height: 36px;
    background: var(--border);
  }

  @media (hover: hover) {
    .hub-row:hover {
      background: var(--surface-hover);
    }
  }

  .hub-row:active {
    transform: scale(0.97);
  }

  /* Untiled: the icon takes the space the tile's padding used to. The box stays
     44px as the optical column that keeps every row's title left-aligned — it is
     layout, not a hit target (the row itself is the target). */
  .hub-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    width: 44px;
    height: 44px;
    flex-shrink: 0;
  }

  .section-activity-dot {
    position: absolute;
    top: -3px;
    right: -3px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--brand);
    box-shadow: 0 0 0 2px var(--surface-2);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration-base) var(--ease-glide);
  }

  .section-activity-dot.unseen {
    opacity: 1;
    transition-duration: 0s;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  :global(.hub-icon-svg) {
    width: 38px;
    height: 38px;
  }

  :global(.hub-icon .hub-icon-svg svg) {
    fill: var(--brand-text);
  }

  .hub-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .hub-title {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--text-strong);
  }

  /* Wraps rather than ellipsizing on one line: the summary is what says what a
     section does, and the longest of them ("Choose when grown-up checks appear",
     the tools in the drawer) lose that meaning mid-word at phone widths.
     Two lines is the ceiling — a third would push the row past the icon column
     it is set beside. */
  .hub-subtitle {
    font-size: var(--font-size-sm);
    color: var(--text-soft);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }
</style>
