<script lang="ts">
  import { browser } from '$app/environment';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import Button from '$lib/components/design/Button.svelte';
  import BrandSections from '$lib/components/styleguide/BrandSections.svelte';
  import PrimitiveSections from '$lib/components/styleguide/PrimitiveSections.svelte';
  import TokenSections from '$lib/components/styleguide/TokenSections.svelte';
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
</script>

<svelte:head>
  <title>Splotch design system</title>
  <meta
    name="description"
    content="The Splotch visual language — voice, brand, tokens, and primitives — rendered live from the app's own sources."
  />
</svelte:head>

<main class="styleguide">
  <header>
    <Breadcrumb current="Design system" />

    <h1>Splotch design system</h1>
    <p>
      The visual language, rendered live from its sources — <code>lib/design/tokens.ts</code>
      (which generates <code>tokens.css</code> via <code>npm run gen:tokens</code>),
      <code>lib/palette.ts</code>, the icon set, and the primitives in
      <code>lib/components/design/</code>. If it's not on this page, it's not part of the visual
      language.
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
  </header>

  <BrandSections />
  <TokenSections />
  <PrimitiveSections />
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
  }

  /* Breadcrumb pins its current crumb to #666 for the light-only /admin host;
     this page is themed (and its toggle flips to dark, where #666 is 3.1:1).
     --text-mid is the same #666 in light theme, so only dark changes. */
  .styleguide :global(.crumb-current) {
    color: var(--text-mid);
  }

  header p {
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
</style>
