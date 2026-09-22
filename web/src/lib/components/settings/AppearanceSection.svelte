<script lang="ts">
  import ToggleRow from './ToggleRow.svelte';
  import Icon from '../Icon.svelte';
  import SegmentedPicker, { type SegmentedPickerOption } from '../design/SegmentedPicker.svelte';
  import { sectionReveal } from './sectionReveal';
  import {
    settingsState,
    setLockRotation,
    setForceLandscapeOrientation,
    setTheme,
    setToolbarStyle,
    type ToolbarStyle,
  } from '$lib/state/settings.svelte';
  import type { ThemePreference } from '$lib/theme';
  import { supportsOrientationLock } from '$lib/platform';
  import '$lib/components/deferredIcons';

  // Windowed platforms (iPadOS 26+) own device orientation through their own
  // window controls and ignore in-app locks, so the toggles are hidden there.
  const showOrientationControls = supportsOrientationLock();

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
      <ToggleRow
        icon={settingsState.lockRotationEnabled ? 'mobile-lock' : 'mobile-rotate'}
        label="Lock device rotation"
        id="lockRotationToggle"
        checked={settingsState.lockRotationEnabled}
        onToggle={setLockRotation}
      />
    </div>

    {#if settingsState.lockRotationEnabled}
      <div class="setting" transition:sectionReveal>
        <ToggleRow
          icon={settingsState.forceLandscapeOrientation ? 'mobile-landscape' : 'mobile-portrait'}
          label="Force landscape orientation"
          id="forceLandscapeToggle"
          checked={settingsState.forceLandscapeOrientation}
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
    gap: var(--setting-icon-gap);
    margin-bottom: 10px;
  }

  .appearance-title {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text);
  }
</style>
