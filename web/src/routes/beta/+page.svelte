<script lang="ts">
  import { onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import AndroidBetaPanel from '$lib/components/beta/AndroidBetaPanel.svelte';
  import IosBetaPanel from '$lib/components/beta/IosBetaPanel.svelte';
  import {
    BETA_PLATFORM_ATTRIBUTE,
    BETA_PLATFORM_BOOT_SCRIPT,
    BETA_PLATFORM_LABELS,
    BETA_PLATFORM_PARAM,
    BETA_PLATFORMS,
    betaPathFor,
    resolveBetaPlatform,
    type BetaPlatform,
  } from '$lib/components/beta/betaPlatform';
  import ScrollCue from '$lib/components/design/ScrollCue.svelte';
  import SegmentedPicker, {
    type SegmentedPickerOption,
  } from '$lib/components/design/SegmentedPicker.svelte';
  import PageShell from '$lib/components/page/PageShell.svelte';
  import { isAndroidBrowser, isIosDevice } from '$lib/platform';

  // The sniff stays here rather than in betaPlatform.ts: that module is read by
  // the E2E specs, which run outside Vite and cannot resolve a `$app` import.
  function detectPlatform(): BetaPlatform | null {
    if (isIosDevice()) return 'ios';
    if (isAndroidBrowser()) return 'android';
    return null;
  }

  // Null until hydration, because the prerendered document cannot know the link's
  // `?os=` or the device: the boot script in <head> has already stamped the
  // resolved platform on <html> and the CSS below has already painted the right
  // panel, so this only catches the picker up with what the reader is looking at.
  // Rendering a guessed selection instead would raise the wrong segment over the
  // right panel for as long as hydration takes.
  let platform = $state<BetaPlatform | null>(null);

  onMount(() => {
    platform = resolveBetaPlatform(
      page.url.searchParams.get(BETA_PLATFORM_PARAM),
      detectPlatform()
    );
  });

  // From here on the state owns the stamp the boot script seeded — one source of
  // truth for which panel is on show, before and after hydration.
  $effect(() => {
    const root = document.documentElement;
    if (platform) root.setAttribute(BETA_PLATFORM_ATTRIBUTE, platform);
    return () => root.removeAttribute(BETA_PLATFORM_ATTRIBUTE);
  });

  const options: SegmentedPickerOption<BetaPlatform>[] = BETA_PLATFORMS.map((value) => ({
    value,
    label: BETA_PLATFORM_LABELS[value],
    id: `beta-platform-${value}`,
  }));

  // Replace rather than push: the tabs are two views of one page, so Back should
  // leave /beta rather than walk back through every tab the reader tried. The
  // URL still carries the choice, so a reload — or a link copied out of the
  // address bar for someone else's phone — opens the same instructions.
  function selectPlatform(next: BetaPlatform) {
    platform = next;
    replaceState(betaPathFor(next), {});
  }
</script>

<svelte:head>
  <title>Join the Splotch Beta · Splotch</title>
  <meta
    name="description"
    content="How to become a Splotch beta tester on Android via Google Play, or on iPhone and iPad via Apple's TestFlight."
  />
  <!-- Link-only page: keeping it out of search indexes limits how widely the
       support address on it circulates. Deliberately NOT paired with a
       robots.txt Disallow — a blocked crawler never fetches the page, so it
       would never see this tag and could still index the bare URL. -->
  <meta name="robots" content="noindex, nofollow" />
  <!-- Runs before first paint, so the tab this reader wants is the one that
       paints. Injected rather than written inline because the script is built
       from the same constants the page reads (betaPlatform.ts) — a literal here
       would be a second copy of the query key and the platform names. -->
  {@html `<script>${BETA_PLATFORM_BOOT_SCRIPT}</script>`}
</svelte:head>

<PageShell title="Join the Splotch beta" wordmark="Splotch beta">
  {#snippet lede()}
    Joining is free and takes three quick steps — plus an optional fourth if you'd like to send
    feedback. Thank you for helping: trying Splotch on a real phone or tablet finds problems we
    can't catch on our own.
  {/snippet}

  <div class="beta-platform-picker">
    <SegmentedPicker
      label="Which device are you installing on?"
      {options}
      selected={platform}
      onSelect={selectPlatform}
      fill={false}
    />
  </div>

  <!-- Without JavaScript the picker cannot filter anything, so it stands down —
       and with no platform stamped on <html>, the rules below leave both sets of
       instructions on show, each already labelled by its own RuleLabel. Not
       scoped by Svelte: this selector matches the class attribute below rather
       than this component. -->
  <noscript>
    <style>
      .beta-platform-picker {
        display: none;
      }
    </style>
  </noscript>

  <div class="beta-platform-panel" data-platform="android">
    <AndroidBetaPanel />
  </div>
  <div class="beta-platform-panel" data-platform="ios">
    <IosBetaPanel />
  </div>

  <ScrollCue />
</PageShell>

<style>
  .beta-platform-picker {
    margin-bottom: 34px;
  }

  /* Both panels are always in the document, so the tabs are a filter rather than
     a fetch — and the filter is CSS keyed on the platform stamped on <html>
     (betaPlatform.ts), which is what lets it apply at first paint instead of at
     hydration. While nothing is stamped, neither rule matches and both panels
     read as stacked sections. Kept in step with BETA_PLATFORM_ATTRIBUTE by
     betaPlatform.test.ts, which reads this file. */
  :global(html[data-beta-os]) .beta-platform-panel {
    display: none;
  }

  :global(html[data-beta-os='android']) .beta-platform-panel[data-platform='android'],
  :global(html[data-beta-os='ios']) .beta-platform-panel[data-platform='ios'] {
    display: block;
  }

  /* Only while both are stacked: with one panel filtered out there is nothing
     above the survivor to leave air under. */
  :global(html:not([data-beta-os])) .beta-platform-panel + .beta-platform-panel {
    margin-top: 48px;
  }
</style>
