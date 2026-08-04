<script lang="ts">
  import { slide } from 'svelte/transition';
  import ToggleRow from './ToggleRow.svelte';
  import Icon from '../Icon.svelte';
  import SegmentedPicker, { type SegmentedPickerOption } from '../design/SegmentedPicker.svelte';
  import { SECTION_SLIDE } from './sections';
  import {
    settings,
    setLockRotation,
    setForceLandscapeOrientation,
    setTheme,
  } from '$lib/state/settings.svelte';
  import type { ThemePreference } from '$lib/theme';
  import { supportsOrientationLock } from '$lib/platform';

  // Windowed platforms (iPadOS 26+) own device orientation through their own
  // window controls and ignore in-app locks, so the toggles are hidden there.
  const showOrientationControls = supportsOrientationLock();

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
      selected={settings.theme}
      onSelect={setTheme}
    />
  </div>

  {#if showOrientationControls}
    <div class="setting">
      <ToggleRow
        icon={settings.lockRotationEnabled ? 'mobile-lock' : 'mobile-rotate'}
        label="Lock device rotation"
        id="lockRotationToggle"
        checked={settings.lockRotationEnabled}
        onToggle={setLockRotation}
      />
    </div>

    {#if settings.lockRotationEnabled}
      <div class="setting" transition:slide={SECTION_SLIDE}>
        <ToggleRow
          icon={settings.forceLandscapeOrientation ? 'mobile-landscape' : 'mobile-portrait'}
          label="Force landscape orientation"
          id="forceLandscapeToggle"
          checked={settings.forceLandscapeOrientation}
          onToggle={setForceLandscapeOrientation}
        />
      </div>
    {/if}
  {/if}
</section>

<style>
  .appearance-label {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .appearance-title {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text);
  }
</style>
