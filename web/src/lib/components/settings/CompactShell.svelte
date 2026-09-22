<script lang="ts">
  import DialogHeader from '../design/DialogHeader.svelte';
  import { settingsModal } from '$lib/state/ui.svelte';
  import Icon from '../Icon.svelte';
  import SplotchyIcon from '../SplotchyIcon.svelte';
  import ToggleRow from './ToggleRow.svelte';
  import ScrollCue from '../design/ScrollCue.svelte';
  import OrientationPicker from './OrientationPicker.svelte';
  import { APP_VERSION } from '$lib/appVersion';
  import { settingsState, setSound, setToolDrawerEnabled } from '$lib/state/settings.svelte';
  import { resolvedTheme, setResolvedTheme } from '$lib/state/appearance.svelte';
  import { supportsOrientationLock } from '$lib/platform';
  import '$lib/components/deferredIcons';

  const showOrientationControls = supportsOrientationLock();
</script>

<!-- Landscape phone: too cramped for the full section list, so just the
     essential quick toggles plus a pointer to portrait for the rest. -->
<div class="settings-header-compact">
  <DialogHeader onclose={settingsModal.hide} closeFeedback><h2>Settings</h2></DialogHeader>
</div>
<div class="quick-toggles-scroll">
  <div class="quick-toggles">
    <div class="setting">
      <ToggleRow
        icon={settingsState.soundEnabled ? 'volume-on' : 'volume-off'}
        label="Sound"
        id="quickSoundToggle"
        checked={settingsState.soundEnabled}
        onToggle={setSound}
      />
    </div>
    <div class="setting">
      <ToggleRow
        icon={resolvedTheme() === 'dark' ? 'theme-dark' : 'theme-light'}
        label="Night Mode"
        id="quickNightToggle"
        checked={resolvedTheme() === 'dark'}
        onToggle={(next) => setResolvedTheme(next ? 'dark' : 'light')}
      />
    </div>
    <div class="setting">
      <ToggleRow
        icon="dashboard-customize"
        label="Tool drawer"
        id="quickToolDrawerToggle"
        checked={settingsState.toolDrawerEnabled}
        onToggle={setToolDrawerEnabled}
      />
    </div>
    <!-- The bottom-right cell is the only one that varies by device: the
         orientation lock selector, or — where the OS owns orientation (see
         supportsOrientationLock) — a mini About cell so the 2×2 stays
         flush instead of leaving a hole. -->
    {#if showOrientationControls}
      <!-- The picker is the whole cell: its track takes the cell's place
           instead of sitting inside a padded card, so the options get all of
           the cell's room. -->
      <div class="setting orientation-cell">
        <OrientationPicker />
      </div>
    {:else}
      <div class="setting about-cell">
        <SplotchyIcon class="about-cell-icon" aria-label="Splotch" role="img" />
        <span class="about-cell-version">Version {APP_VERSION}</span>
      </div>
    {/if}
  </div>
  <ScrollCue />
</div>
<p class="portrait-note">
  <Icon name="mobile-portrait" class="portrait-note-icon" />
  Switch to portrait for the full settings.
</p>

<style>
  /* Every vertical pixel counts here, so the header shrinks (its own copy of the
     .settings-header shape, since SettingsModal's is scoped to that component) and the
     toggles pack into a two-column grid that scrolls only if it must. */
  .settings-header-compact {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 24px 10px;
  }

  .settings-header-compact h2 {
    margin: 0;
    font-size: var(--font-size-lg);
    color: var(--text-strong);
    font-weight: var(--font-weight-semibold);
  }

  /* The grid sits inside its scroller rather than being one, so the continuation
     cue can be a plain last child of the scrolling content instead of a cell the
     2×2 has to make room for. */
  .quick-toggles-scroll {
    /* Shallower than the picker's default: this pane is only a couple of rows
       tall on the landscape phone it exists for, and a 72px fade would dim most
       of what is left to read. */
    --scroll-cue-height: 32px;

    flex: 1;
    min-height: 0;
    overflow-y: auto;
    --scrollport-bottom-padding: 0px;
    padding: 0 24px var(--scrollport-bottom-padding);
  }

  .quick-toggles {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--setting-gap);
  }

  /* The orientation track replaces the cell's card, so the cell gives up its
     padding and surface, and the track takes the card's corner radius through
     SegmentedPicker's radius properties, which inherit from here. The options
     stay concentric with it: --radius-lg minus the track's --space-1 inset.
     Over-qualified by .quick-toggles so it outranks SettingsModal's shared
     .setting padding and does not depend on stylesheet order. */
  .quick-toggles .setting.orientation-cell {
    --segment-track-radius: var(--radius-lg);
    --segment-option-radius: var(--radius-md);

    display: flex;
    padding: 0;
    background: none;
  }

  /* Non-toggle fourth cell: it sits on the same icon column as ToggleRow so the
     grid reads as one family. */
  .about-cell {
    display: flex;
    align-items: center;
    gap: var(--setting-icon-gap);
  }

  :global(.about-cell-icon) {
    width: var(--setting-icon-size);
    height: var(--setting-icon-size);
    flex-shrink: 0;
  }

  .about-cell-version {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-soft);
  }

  .portrait-note {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 0;
    padding: 10px 24px 14px;
    font-size: var(--font-size-sm);
    color: var(--text-soft);
    text-align: center;
  }

  :global(.portrait-note-icon) {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }

  :global(.portrait-note-icon svg) {
    fill: var(--text-soft);
  }
</style>
