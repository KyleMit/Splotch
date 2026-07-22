<script lang="ts">
  import { slide } from 'svelte/transition';
  import ToggleRow from './ToggleRow.svelte';
  import Icon from '../Icon.svelte';
  import {
    settings,
    setLockRotation,
    setForceLandscapeOrientation,
    setTheme,
  } from '$lib/state/settings.svelte';
  import type { ThemePreference } from '$lib/theme';
  import type { CommonIconName } from '../iconTypes';
  import { supportsOrientationLock } from '$lib/platform';

  // Windowed platforms (iPadOS 26+) own device orientation through their own
  // window controls and ignore in-app locks, so the toggles are hidden there.
  const showOrientationControls = supportsOrientationLock();

  const themeOptions: { value: ThemePreference; label: string; icon: CommonIconName }[] = [
    { value: 'light', label: 'Light', icon: 'theme-light' },
    { value: 'dark', label: 'Dark', icon: 'theme-dark' },
    { value: 'system', label: 'System', icon: 'theme-auto' },
  ];
</script>

<section class="setting-group">
  <div class="setting">
    <div class="appearance-label">
      <Icon name="theme-auto" class="setting-icon" />
      <span class="appearance-title">Theme</span>
    </div>
    <div class="theme-picker" role="radiogroup" aria-label="Theme">
      {#each themeOptions as option (option.value)}
        <button
          class="theme-option"
          class:active={settings.theme === option.value}
          id="themeOption-{option.value}"
          role="radio"
          aria-checked={settings.theme === option.value}
          onclick={() => setTheme(option.value)}
        >
          <Icon name={option.icon} class="theme-option-icon" />
          <span>{option.label}</span>
        </button>
      {/each}
    </div>
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
      <div class="setting" transition:slide={{ duration: 220 }}>
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
  .setting-group .setting + .setting {
    margin-top: 6px;
  }

  .appearance-label {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  .appearance-title {
    font-size: var(--font-size-md);
    font-weight: 500;
    color: var(--text);
  }

  /* iOS-style segmented control: the active segment reads as a raised card. */
  .theme-picker {
    display: flex;
    gap: 4px;
    padding: 4px;
    background: var(--slider-track);
    border-radius: var(--radius-md);
  }

  .theme-option {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 4px;
    border: none;
    border-radius: 9px;
    background: transparent;
    color: var(--text-mid);
    font-family: inherit;
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--duration-fast) ease,
      color var(--duration-fast) ease,
      box-shadow var(--duration-fast) ease;
  }

  @media (hover: hover) {
    .theme-option:not(.active):hover {
      color: var(--text-strong);
    }
  }

  .theme-option.active {
    background: var(--surface);
    color: var(--text-strong);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  }

  :global(.theme-option-icon) {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
</style>
