<script lang="ts">
  import OrientationPicker from './OrientationPicker.svelte';
  import Icon from '../Icon.svelte';
  import SegmentedPicker, { type SegmentedPickerOption } from '../design/SegmentedPicker.svelte';
  import {
    settingsState,
    setTheme,
    setToolbarStyle,
    type ToolbarStyle,
  } from '$lib/state/settings.svelte';
  import type { ThemePreference } from '$lib/theme';
  import { autoOrientationOverridesSystemLock, orientationLockApplies } from '$lib/platform';
  import { fullscreenState } from '$lib/state/fullscreen.svelte';
  import '$lib/components/deferredIcons';

  // Hidden wherever a lock would not be honored: windowed platforms (iPadOS 26+)
  // own device orientation through their own window controls, and a browser tab
  // outside fullscreen has its lock refused outright. Keyed on the fullscreen
  // state so the row returns the moment the Fullscreen Toggle earns it.
  const showOrientationControls = $derived(orientationLockApplies(fullscreenState.active));

  // Auto beats the device's own rotation lock only in the Android app. Everywhere
  // else it defers to that setting, and nothing reports whether it is on, so the
  // caption states the dependency rather than guessing at the state.
  const autoFollowsSystemRotation = !autoOrientationOverridesSystemLock();

  const toolbarOptions: SegmentedPickerOption<ToolbarStyle>[] = [
    { value: 'buttons', label: 'Raised', icon: 'button-style-raised' },
    { value: 'bare', label: 'Flat', icon: 'button-style-flat' },
  ];

  const themeOptions: SegmentedPickerOption<ThemePreference>[] = [
    { value: 'light', label: 'Light', icon: 'theme-light', id: 'themeOption-light' },
    { value: 'dark', label: 'Dark', icon: 'theme-dark', id: 'themeOption-dark' },
    { value: 'system', label: 'System', icon: 'theme-auto', id: 'themeOption-system' },
  ];
</script>

<section class="setting-group">
  <div class="setting">
    <div class="appearance-label">
      <Icon name="theme-auto" class="setting-icon" />
      <span class="appearance-title">Theme</span>
    </div>
    <SegmentedPicker
      label="Theme"
      options={themeOptions}
      selected={settingsState.theme}
      onSelect={setTheme}
    />
  </div>

  <div class="setting">
    <div class="appearance-label">
      <Icon name="button-style-raised" class="setting-icon" />
      <span class="appearance-title">Button style</span>
    </div>
    <SegmentedPicker
      label="Button style"
      options={toolbarOptions}
      selected={settingsState.toolbarStyle}
      onSelect={setToolbarStyle}
    />
  </div>

  {#if showOrientationControls}
    <div class="setting">
      <div class="appearance-label">
        <Icon name="mobile-rotate" class="setting-icon" />
        <span class="appearance-title">Orientation</span>
      </div>
      <OrientationPicker />
      {#if autoFollowsSystemRotation}
        <p class="orientation-note">Auto follows your device's rotation setting.</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .appearance-label {
    display: flex;
    align-items: center;
    gap: var(--setting-icon-gap);
    margin-bottom: 10px;
  }

  .appearance-title {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text);
  }

  .orientation-note {
    margin: var(--space-2) 0 0;
    font-size: var(--font-size-sm);
    color: var(--text-soft);
  }
</style>
