<script lang="ts">
  import { browser } from '$app/environment';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import Button from '$lib/components/design/Button.svelte';
  import AssetSections from '$lib/components/styleguide/AssetSections.svelte';
  import ChromeSections from '$lib/components/styleguide/ChromeSections.svelte';
  import PrimitiveSections from '$lib/components/styleguide/PrimitiveSections.svelte';
  import TokenSections from '$lib/components/styleguide/TokenSections.svelte';
  import VoiceSections from '$lib/components/styleguide/VoiceSections.svelte';
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

  const themeOptions: ThemePreference[] = ['light', 'system', 'dark'];

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

<main class="styleguide">
  <header>
    <Breadcrumb current="Design system" />

    <h1>Splotch design system</h1>
    <p>
      The visual language, rendered live from its sources — <code>lib/design/tokens.ts</code>
      (which generates <code>tokens.css</code> via <code>npm run gen:tokens</code>),
      <code>lib/palette.ts</code>, the icon set, and the shipped components. If it's not on this
      page, it's not part of the visual language.
    </p>
    <div class="theme-toggle" role="group" aria-label="Theme">
      {#each themeOptions as option (option)}
        <Button
          variant={theme === option ? 'brand' : 'ghost'}
          size="sm"
          onclick={() => setTheme(option)}
        >
          {option}
        </Button>
      {/each}
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
    <TokenSections />
    <AssetSections />
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
</main>

<style>
  .styleguide {
    height: 100dvh;
    overflow-y: auto;
    padding: var(--space-6);
    background: var(--app-bg);
    color: var(--text);
    /* pan-y keeps touch scrolling working under the app's global gesture
       guards; pinch-zoom stays allowed — this is a public reference page. */
    touch-action: pan-y pinch-zoom;
    user-select: text;
    -webkit-user-select: text;
    scroll-behavior: smooth;
  }

  @media (prefers-reduced-motion: reduce) {
    .styleguide {
      scroll-behavior: auto;
    }
  }

  /* Breadcrumb pins its current crumb to #666 for the light-only /admin host;
     this page is themed (and its toggle flips to dark, where #666 is 3.1:1).
     --text-mid is the same #666 in light theme, so only dark changes. */
  .styleguide :global(.crumb-current) {
    color: var(--text-mid);
  }

  header p,
  .part > p {
    max-width: 60ch;
    margin: var(--space-2) 0 var(--space-3);
    font-size: var(--font-size-md);
  }

  h1 {
    color: var(--text-strong);
    font-size: var(--font-size-3xl);
  }

  code {
    font-size: var(--font-size-xs);
    color: var(--brand-text);
  }

  .theme-toggle {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }

  .part-nav {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-4);
    font-size: var(--font-size-sm);
    color: var(--text-mid);
  }

  .part-nav a {
    color: var(--brand-text);
    font-weight: var(--font-weight-semibold);
  }

  .part {
    margin-top: var(--space-8);
    border-top: var(--border-width) solid var(--border);
    padding-top: var(--space-6);
    scroll-margin-top: var(--space-4);
  }

  .part > h2 {
    color: var(--text-strong);
    font-size: var(--font-size-2xl);
  }
</style>
