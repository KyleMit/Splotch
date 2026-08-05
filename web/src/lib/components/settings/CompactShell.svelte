<script lang="ts">
  import Icon from '../Icon.svelte';
  import SplotchyIcon from '../SplotchyIcon.svelte';
  import ToggleRow from './ToggleRow.svelte';
  import SegmentedPicker, { type SegmentedPickerOption } from '../design/SegmentedPicker.svelte';
  import { APP_VERSION } from '$lib/appVersion';
  import {
    settings,
    setSound,
    setLockRotation,
    setForceLandscapeOrientation,
    setAdvancedControls,
    setTheme,
  } from '$lib/state/settings.svelte';
  import { resolvedTheme, systemPrefersDark } from '$lib/state/appearance.svelte';
  import { resolveTheme, type ResolvedTheme } from '$lib/theme';
  import { supportsOrientationLock } from '$lib/platform';

  const showOrientationControls = supportsOrientationLock();

  // Compact orientation control: a two-way Portrait / Landscape selector that
  // replaces the old single Lock Rotation switch. Picking a side is what enables
  // the lock (and sets the orientation) — so a phone with rotation *unlocked*
  // keeps free-rotating until the parent taps a side, and neither segment reads
  // as active. When locked, the active segment mirrors forceLandscapeOrientation,
  // and tapping it again releases the lock back to free rotation. This is also
  // the escape hatch from a landscape lock: tapping Portrait flips the lock
  // upright, which rotates the device out of this cramped shell and back to the
  // full settings — the old switch could only *remove* the lock.
  type LockedOrientation = 'portrait' | 'landscape';
  const orientationOptions: SegmentedPickerOption<LockedOrientation>[] = [
    { value: 'portrait', label: 'Portrait', icon: 'mobile-portrait', id: 'quickLockPortrait' },
    { value: 'landscape', label: 'Landscape', icon: 'mobile-landscape', id: 'quickLockLandscape' },
  ];
  const lockedOrientation = $derived<LockedOrientation | null>(
    settings.lockRotationEnabled
      ? settings.forceLandscapeOrientation
        ? 'landscape'
        : 'portrait'
      : null
  );
  function lockOrientation(value: LockedOrientation) {
    // Tapping the already-locked side releases the lock — the only way back to
    // free rotation from the compact shell.
    if (lockedOrientation === value) {
      setLockRotation(false);
      return;
    }
    setForceLandscapeOrientation(value === 'landscape');
    setLockRotation(true);
  }
</script>

<!-- Landscape phone: too cramped for the full section list, so just the
     essential quick toggles plus a pointer to portrait for the rest. -->
<header class="settings-header-compact">
  <h2>Settings</h2>
</header>
<div class="quick-toggles">
  <div class="setting">
    <ToggleRow
      icon={settings.soundEnabled ? 'volume-on' : 'volume-off'}
      label="Sound"
      id="quickSoundToggle"
      checked={settings.soundEnabled}
      onToggle={setSound}
    />
  </div>
  <div class="setting">
    <ToggleRow
      icon={resolvedTheme() === 'dark' ? 'theme-dark' : 'theme-light'}
      label="Night Mode"
      id="quickNightToggle"
      checked={resolvedTheme() === 'dark'}
      onToggle={(next) => {
        const wanted: ResolvedTheme = next ? 'dark' : 'light';
        setTheme(resolveTheme('system', systemPrefersDark()) === wanted ? 'system' : wanted);
      }}
    />
  </div>
  <div class="setting">
    <ToggleRow
      icon="dashboard-customize"
      label="Advanced Controls"
      id="quickAdvancedControlsToggle"
      checked={settings.advancedControlsEnabled}
      onToggle={setAdvancedControls}
    />
  </div>
  <!-- The bottom-right cell is the only one that varies by device: the
       orientation lock selector, or — where the OS owns orientation (see
       supportsOrientationLock) — a mini About cell so the 2×2 stays
       flush instead of leaving a hole. -->
  {#if showOrientationControls}
    <!-- Matches the Theme picker in AppearanceSection, at the compact size so
         the cell's height lines up with the toggle rows beside it. No segment
         is active while rotation is unlocked, so the pair reads as "off" until
         the parent picks a side. -->
    <div class="setting orientation-cell">
      <SegmentedPicker
        label="Lock screen orientation"
        mode="toggle"
        size="sm"
        options={orientationOptions}
        selected={lockedOrientation}
        onSelect={lockOrientation}
      />
    </div>
  {:else}
    <div class="setting about-cell">
      <SplotchyIcon class="about-cell-icon" aria-label="Splotch" role="img" />
      <span class="about-cell-version">Version {APP_VERSION}</span>
    </div>
  {/if}
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
    padding-right: var(--modal-close-clearance-x);
    /* Reserve the close button's full vertical extent (--modal-close-clearance-y
       in app.css) so the top-right toggle cell starts below it instead of
       sliding up under the button. */
    min-height: var(--modal-close-clearance-y);
  }

  .settings-header-compact h2 {
    margin: 0;
    font-size: var(--font-size-lg);
    color: var(--text-strong);
    font-weight: var(--font-weight-semibold);
  }

  .quick-toggles {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    align-content: start;
    padding: 0 24px;
  }

  /* Orientation fourth cell: a Portrait / Landscape segmented control in place
     of ToggleRow's switch. Tighter padding than a switch cell so the segments
     fill it and its height lines up with the toggle rows beside it. */
  .setting.orientation-cell {
    padding: 6px;
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
