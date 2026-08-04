<script lang="ts">
  import { browser } from '$app/environment';
  import AssetSections from '$lib/components/styleguide/AssetSections.svelte';
  import ChromeSections from '$lib/components/styleguide/ChromeSections.svelte';
  import PrimitiveSections from '$lib/components/styleguide/PrimitiveSections.svelte';
  import RecipeSections from '$lib/components/styleguide/RecipeSections.svelte';
  import TokenSections from '$lib/components/styleguide/TokenSections.svelte';
  import VoiceSections from '$lib/components/styleguide/VoiceSections.svelte';
  import PageShell from '$lib/components/page/PageShell.svelte';
  import SegmentedPicker, {
    type SegmentedPickerOption,
  } from '$lib/components/design/SegmentedPicker.svelte';
  import { applyTheme, isThemePreference, type ThemePreference } from '$lib/theme';

  // Start from whatever data-theme the app has already stamped on <html> (no
  // attribute = system). The toggle restamps it ephemerally for preview only —
  // it doesn't write the stored setting, and the drawing page re-applies the
  // parent's real preference on mount.
  const appliedTheme = browser ? document.documentElement.dataset.theme : undefined;
  let theme = $state<ThemePreference>(isThemePreference(appliedTheme) ? appliedTheme : 'system');

  function setTheme(next: ThemePreference) {
    theme = next;
    applyTheme(next);
  }

  // Lowercase labels on purpose: the styleguide shows the raw preference values.
  const themeOptions: SegmentedPickerOption<ThemePreference>[] = (
    ['light', 'system', 'dark'] as const
  ).map((value) => ({ value, label: value }));

  const parts = [
    { id: 'foundations', title: 'Foundations' },
    { id: 'components', title: 'Components & chrome' },
    { id: 'brand', title: 'Brand & voice' },
  ];
</script>

<svelte:head>
  <title>Splotch design system</title>
  <meta
    name="description"
    content="The Splotch visual language — tokens, components, and voice — rendered live from the app's own sources."
  />
</svelte:head>

<!-- The one PageShell page on the themed defaults: the styleguide must render
     in both themes, so unlike the light-pinned parent pages it forwards no
     palette overrides — the class is only the hook the E2E specs anchor on. -->
<PageShell class="styleguide" title="Splotch design system" wordmark="Splotch">
  {#snippet lede()}
    The visual language, rendered live from its sources — <code>lib/design/tokens.ts</code>
    (which generates <code>tokens.css</code> via <code>npm run gen:tokens</code>),
    <code>lib/palette.ts</code>, the icon set, and the shipped components. If it's not on this page,
    it's not part of the visual language.
  {/snippet}

  <header class="tools">
    <div class="theme-toggle">
      <SegmentedPicker
        label="Theme"
        fill={false}
        options={themeOptions}
        selected={theme}
        onSelect={setTheme}
      />
    </div>
    <nav class="part-nav" aria-label="Page sections">
      On this page:
      {#each parts as part, index (part.id)}
        {#if index > 0}<span aria-hidden="true">·</span>{/if}
        <a href="#{part.id}">{part.title}</a>
      {/each}
    </nav>
  </header>

  <section class="part" id="foundations">
    <h2>Foundations</h2>
    <p>
      The vocabulary every style is built from — tokens, paper, the drawing inks, and the icon set.
      Consume these by reference (<code>var(--…)</code>, imports), never by copied value.
    </p>
    <aside class="defaults" aria-label="Default choices">
      <h3>Not sure? Start here</h3>
      <p>
        Most styling decisions should never reach the tables below. A card is
        <code>--surface</code> with a <code>--border</code> hairline, <code>--radius-lg</code>
        corners, and <code>--space-4</code> padding. UI chrome is <code>--font-size-sm</code>, prose
        is <code>--font-size-md</code>, both in <code>--text</code>; headings are
        <code>--text-strong</code> at <code>--font-weight-bold</code>. The primary action is the
        <code>Button</code> primitive's <code>brand</code> variant. Transitions run
        <code>--duration-base</code>; anything that pops in takes <code>--ease-pop</code>. Reach
        past a default only when its rule below says so.
      </p>
    </aside>
    <TokenSections />
    <AssetSections />
    <RecipeSections />
  </section>

  <section class="part" id="components">
    <h2>Components &amp; chrome</h2>
    <p>
      The shared building blocks: the primitives in <code>lib/components/design/</code>, the
      settings furniture, and the global chrome classes in <code>app.css</code> — plus a named index of
      the chrome that is deliberately bespoke.
    </p>
    <PrimitiveSections />
    <ChromeSections />
  </section>

  <section class="part" id="brand">
    <h2>Brand &amp; voice</h2>
    <p>How Splotch sounds and signs its name — the copy rules and the brand marks.</p>
    <VoiceSections />
  </section>
</PageShell>

<style>
  .part > p {
    max-width: var(--page-measure);
    margin: var(--space-2) 0 var(--space-3);
    font-size: var(--font-size-sm);
  }

  code {
    font-size: var(--font-size-xs);
    color: var(--brand-text);
  }

  /* Sits between the shell's hero and the first part: the toggle and jump nav
     are page furniture, not content, so they stay above the first rule. */
  .tools {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .part-nav {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--page-muted);
  }

  .part-nav a {
    color: var(--brand-text);
    font-weight: var(--font-weight-semibold);
  }

  .part {
    margin-top: var(--space-8);
    border-top: var(--border-width) solid var(--page-rule);
    padding-top: var(--space-6);
    scroll-margin-top: var(--space-4);
  }

  .part > h2 {
    color: var(--page-ink);
    font-size: var(--font-size-xl);
  }

  .defaults {
    max-width: 66ch;
    margin-top: var(--space-4);
    padding: var(--space-4) var(--space-5);
    background: var(--brand-wash);
    border-radius: var(--radius-lg);
  }

  .defaults h3 {
    margin: 0 0 var(--space-2);
    color: var(--page-ink);
    font-size: var(--font-size-md);
  }

  .defaults p {
    margin: 0;
    font-size: var(--font-size-sm);
    line-height: 1.6;
  }
</style>
