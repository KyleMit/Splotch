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
  import type { CommonIconName } from '$lib/components/iconTypes';
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

  // The mark beside each label, kept here rather than in betaPlatform.ts so that
  // module stays free of `$lib` imports the E2E specs cannot resolve. The Apple
  // side carries a generic phone-and-tablet glyph: Apple's marketing guidance
  // rules out the standalone Apple logo, and the label names the products.
  const TAB_ICONS: Record<BetaPlatform, CommonIconName> = {
    android: 'android',
    ios: 'phone-tablet',
  };

  const options: SegmentedPickerOption<BetaPlatform>[] = BETA_PLATFORMS.map((value) => ({
    value,
    label: BETA_PLATFORM_LABELS[value],
    icon: TAB_ICONS[value],
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
       would be a second copy of the query key and the platform names. The
       closing tag is split so neither the Svelte nor the ESLint parser reads it
       as the end of a script block. -->
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- a module constant, never input -->
  {@html `<script>${BETA_PLATFORM_BOOT_SCRIPT}${'<'}/script>`}
</svelte:head>

<PageShell title="Join the Splotch beta" wordmark="Splotch beta">
  {#snippet lede()}
    Joining is free and takes three quick steps — plus an optional fourth if you'd like to send
    feedback. Thank you for helping!
  {/snippet}

  <div class="beta-platform-picker">
    <SegmentedPicker
      variant="underline"
      label="Which device are you installing on?"
      {options}
      selected={platform}
      onSelect={selectPlatform}
    />
  </div>

  <!-- The whole no-JavaScript story, in one block that only exists when there is
       no JavaScript: the picker cannot filter without it, so it stands down and
       two real links take its place. They are the same choice as a table of
       contents — an anchor into the panel below — and `:target` turns that jump
       into the same filter the picker performs, so a reader with scripting off
       gets their platform's instructions rather than a scroll past the other
       one's. Arriving with no hash still shows both, which is what makes the
       links safe to land on.

       None of this is scoped by Svelte, and none of it needs the
       `html:not([data-beta-os])` guard the block below uses: scripting-off is
       the only state in which a browser renders <noscript> content at all, and
       it is exactly the state in which nothing stamps that attribute. -->
  <noscript>
    <style>
      .beta-platform-picker {
        display: none;
      }

      .beta-jump {
        display: flex;
        gap: 28px;
        margin-bottom: 34px;
        border-bottom: var(--border-width) solid var(--border);
      }

      .beta-jump a {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        padding: 9px 2px 11px;
        margin-bottom: calc(-1 * var(--border-width));
        border-bottom: 3px solid transparent;
        color: var(--page-muted);
        font-size: var(--font-size-md);
        font-weight: var(--font-weight-semibold);
        line-height: 1.25;
        text-decoration: none;
      }

      /* The jumped-to panel is a selection, so the link that made it wears the
         same live mark the picker's tab would. */
      body:has(#beta-android:target) .beta-jump a[href='#beta-android'],
      body:has(#beta-ios:target) .beta-jump a[href='#beta-ios'] {
        color: var(--page-link);
        border-bottom-color: var(--brand);
      }

      /* Filter to the jumped-to panel — but only once one is targeted, so the
         bare URL still reads as two stacked sections. Where :has() is missing
         (Firefox below 121) nothing matches and the reader keeps both panels
         plus a working jump, which is the behavior this replaces. */
      body:has(.beta-platform-panel:target) .beta-platform-panel:not(:target) {
        display: none;
      }

      /* The row the reader just used stays in view above the panel it opened. */
      .beta-platform-panel {
        scroll-margin-top: 90px;
      }
    </style>

    <nav class="beta-jump" aria-label="Which device are you installing on?">
      <a href="#beta-android">Android</a>
      <a href="#beta-ios">iPhone / iPad</a>
    </nav>
  </noscript>

  <div class="beta-platform-panel" id="beta-android" data-platform="android">
    <AndroidBetaPanel />
  </div>
  <div class="beta-platform-panel" id="beta-ios" data-platform="ios">
    <IosBetaPanel />
  </div>

  <ScrollCue />
</PageShell>

<style>
  .beta-platform-picker {
    margin-bottom: 34px;
  }

  /* On a phone the sheet is the screen (PageShell drops its frame at this
     width), so the tab row gives up the text gutter too: the rule runs to the
     glass and the two cells split the whole screen between them. The picker
     divides whatever width it is handed — the bleed is the page's, because the
     gutter is. Restates PHONE_MAX_WIDTH_PX (lib/breakpoints.ts); phoneStep.test.ts
     fails if this and PageShell's step disagree. */
  @media (max-width: 540px) {
    .beta-platform-picker {
      margin-inline: calc(-1 * var(--page-gutter));
    }
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
