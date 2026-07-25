<script lang="ts">
  import { browser } from '$app/environment';
  import Button from '$lib/components/design/Button.svelte';
  import Disclosure from '$lib/components/design/Disclosure.svelte';
  import StatusMessage from '$lib/components/design/StatusMessage.svelte';
  import { brand, scale, themes, toCssVarName, zIndex, type ThemeTokens } from '$lib/design/tokens';
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

  const themeKeys = Object.keys(themes.light) as (keyof ThemeTokens)[];
  // Tokens whose value isn't a paintable color get listed as text, not swatches.
  const nonColorKeys = new Set<keyof ThemeTokens>([
    'lineartFilter',
    'lineartBlend',
    'floatShadow',
    'floatShadowFlyout',
  ]);
  const colorKeys = themeKeys.filter((k) => !nonColorKeys.has(k));

  const spaceKeys = Object.keys(scale).filter((k) => k.startsWith('space'));
  const radiusKeys = Object.keys(scale).filter((k) => k.startsWith('radius') && k !== 'radiusPill');
  const fontSizeKeys = Object.keys(scale).filter((k) => k.startsWith('fontSize'));
  const shadowKeys = Object.keys(scale).filter((k) => k.startsWith('shadow'));
  const motionEntries = Object.entries(scale).filter(
    ([k]) => k.startsWith('duration') || k.startsWith('ease')
  );
  // Already authored low-to-high in tokens.ts; render it in that order so the
  // page shows the stacking order, not just the values.
  const zIndexEntries = Object.entries(zIndex);

  const cssVar = (key: string) => `var(${toCssVarName(key)})`;

  const themeOptions: ThemePreference[] = ['light', 'system', 'dark'];
  const buttonVariants = ['brand', 'wash', 'danger', 'ghost'] as const;
  const buttonSizes = ['md', 'sm'] as const;
  const statusMessageStatuses = ['success', 'error'] as const;
</script>

<svelte:head>
  <title>Splotch design tokens</title>
</svelte:head>

<main class="styleguide">
  <header>
    <h1>Design tokens</h1>
    <p>
      Rendered live from <code>lib/design/tokens.ts</code> — the source that generates
      <code>tokens.css</code> (<code>npm run gen:tokens</code>). If it's not on this page, it's not
      part of the visual language.
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

  <section>
    <h2>Brand</h2>
    <div class="swatch-grid">
      {#each Object.entries(brand).filter(([k]) => k !== 'brandTintFilter') as [key, value] (key)}
        <div class="swatch-card">
          <div class="swatch" style:background={cssVar(key)}></div>
          <code>{toCssVarName(key)}</code>
          <span class="value">{value}</span>
        </div>
      {/each}
    </div>
  </section>

  <section>
    <h2>Theme colors</h2>
    <p>Swatches paint the live CSS variable — flip the theme above to see the dark values.</p>
    <div class="swatch-grid">
      {#each colorKeys as key (key)}
        <div class="swatch-card">
          <div class="swatch" style:background={cssVar(key)}></div>
          <code>{toCssVarName(key)}</code>
          <span class="value">{themes.light[key]} · {themes.dark[key]}</span>
        </div>
      {/each}
    </div>
    <h3>Non-color theme tokens</h3>
    <ul class="raw-list">
      {#each [...nonColorKeys] as key (key)}
        <li>
          <code>{toCssVarName(key)}</code>
          <span class="value">{themes.light[key]} · {themes.dark[key]}</span>
        </li>
      {/each}
    </ul>
  </section>

  <section>
    <h2>Spacing</h2>
    <div class="row-list">
      {#each spaceKeys as key (key)}
        <div class="scale-row">
          <code>{toCssVarName(key)}</code>
          <div class="space-bar" style:width={cssVar(key)}></div>
          <span class="value">{scale[key as keyof typeof scale]}</span>
        </div>
      {/each}
    </div>
  </section>

  <section>
    <h2>Radius</h2>
    <div class="radius-grid">
      {#each radiusKeys as key (key)}
        <div class="swatch-card">
          <div class="radius-box" style:border-radius={cssVar(key)}></div>
          <code>{toCssVarName(key)}</code>
          <span class="value">{scale[key as keyof typeof scale]}</span>
        </div>
      {/each}
      <div class="swatch-card">
        <div class="radius-box pill" style:border-radius={cssVar('radiusPill')}></div>
        <code>--radius-pill</code>
        <span class="value">{scale.radiusPill}</span>
      </div>
    </div>
  </section>

  <section>
    <h2>Type scale</h2>
    <div class="row-list">
      {#each fontSizeKeys as key (key)}
        <div class="scale-row">
          <code>{toCssVarName(key)}</code>
          <span class="type-sample" style:font-size={cssVar(key)}>Splotch says hello</span>
          <span class="value">{scale[key as keyof typeof scale]}</span>
        </div>
      {/each}
      <div class="scale-row">
        <code>{toCssVarName('inputFontSize')}</code>
        <span class="type-sample" style:font-size={cssVar('inputFontSize')}>Splotch says hello</span
        >
        <span class="value">{scale.inputFontSize}</span>
      </div>
      <div class="scale-row">
        <code>{toCssVarName('fontMono')}</code>
        <span class="type-sample" style:font-family={cssVar('fontMono')}>Splotch says hello</span>
        <span class="value">{scale.fontMono}</span>
      </div>
    </div>
  </section>

  <section>
    <h2>Elevation</h2>
    <div class="shadow-grid">
      {#each shadowKeys as key (key)}
        <div class="swatch-card">
          <div class="shadow-box" style:box-shadow={cssVar(key)}></div>
          <code>{toCssVarName(key)}</code>
        </div>
      {/each}
      <div class="swatch-card">
        <div class="shadow-box float" style:box-shadow={cssVar('floatShadow')}></div>
        <code>--float-shadow</code>
      </div>
      <div class="swatch-card">
        <div class="shadow-box float" style:box-shadow={cssVar('floatShadowFlyout')}></div>
        <code>--float-shadow-flyout</code>
      </div>
    </div>
  </section>

  <section>
    <h2>Motion</h2>
    <ul class="raw-list">
      {#each motionEntries as [key, value] (key)}
        <li><code>{toCssVarName(key)}</code> <span class="value">{value}</span></li>
      {/each}
    </ul>
  </section>

  <section>
    <h2>Stacking</h2>
    <p>
      The cross-component chrome order, low to high — all of it in the root stacking context. Ties
      are deliberate: <code>--z-panel</code>/<code>--z-flyout</code> (the flyout nests inside the
      panel) and <code>--z-clear-button</code>/<code>--z-notch</code> (resolved by DOM order).
    </p>
    <ul class="raw-list">
      {#each zIndexEntries as [key, value] (key)}
        <li><code>{toCssVarName(key)}</code> <span class="value">{value}</span></li>
      {/each}
    </ul>
  </section>

  <section>
    <h2>Button</h2>
    <p><code>lib/components/design/Button.svelte</code></p>
    {#each buttonSizes as size (size)}
      <div class="button-row">
        {#each buttonVariants as variant (variant)}
          <Button {variant} {size}>{variant} {size}</Button>
        {/each}
        <Button variant="brand" {size} disabled>disabled</Button>
      </div>
    {/each}
  </section>

  <section>
    <h2>Status message</h2>
    <p><code>lib/components/design/StatusMessage.svelte</code></p>
    {#each statusMessageStatuses as status (status)}
      <StatusMessage {status}
        >The {status} wash, as a form shows it after a submit resolves.</StatusMessage
      >
    {/each}
  </section>

  <section>
    <h2>Disclosure</h2>
    <p><code>lib/components/design/Disclosure.svelte</code></p>
    <Disclosure class="disclosure-demo">
      {#snippet summary()}What does the primitive own?{/snippet}
      <p class="disclosure-demo-body">
        The bordered shell, the hidden native marker, and the <code>›</code> chevron that rotates on
        open. Padding, type, color, and background stay with the call site, through the forwarded
        <code>class</code>.
      </p>
    </Disclosure>
  </section>
</main>

<style>
  .styleguide {
    height: 100dvh;
    overflow-y: auto;
    padding: var(--space-6);
    background: var(--app-bg);
    color: var(--text);
    touch-action: pan-y;
    user-select: text;
    -webkit-user-select: text;
  }

  header p,
  section > p {
    max-width: 60ch;
    margin: var(--space-2) 0 var(--space-3);
    font-size: var(--font-size-md);
  }

  h1 {
    color: var(--text-strong);
    font-size: var(--font-size-3xl);
  }

  h2 {
    color: var(--text-strong);
    font-size: var(--font-size-xl);
    margin-bottom: var(--space-2);
  }

  h3 {
    color: var(--text-strong);
    font-size: var(--font-size-md);
    margin: var(--space-4) 0 var(--space-2);
  }

  section {
    margin-top: var(--space-8);
  }

  code {
    font-size: var(--font-size-xs);
    color: var(--brand-text);
  }

  .value {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }

  section :global(.disclosure-demo summary) {
    padding: var(--space-3);
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--brand-text);
    background: var(--surface-2);
  }

  .disclosure-demo-body {
    margin: 0;
    padding: 0 var(--space-3) var(--space-3);
    font-size: var(--font-size-sm);
    line-height: 1.5;
    color: var(--text-mid);
  }

  .theme-toggle {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }

  .swatch-grid,
  .radius-grid,
  .shadow-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--space-3);
  }

  .swatch-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .swatch {
    height: var(--space-8);
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
  }

  .row-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .scale-row {
    display: grid;
    grid-template-columns: 10rem 1fr 6rem;
    align-items: center;
    gap: var(--space-3);
  }

  .space-bar {
    height: var(--space-4);
    background: var(--brand);
    border-radius: var(--radius-xs);
  }

  .type-sample {
    color: var(--text-strong);
  }

  .radius-box {
    height: var(--space-8);
    background: var(--brand-wash);
    border: 2px solid var(--brand);
  }

  .radius-box.pill {
    height: var(--space-6);
  }

  .shadow-box {
    height: var(--space-8);
    background: var(--surface);
    border-radius: var(--radius-md);
    margin-bottom: var(--space-2);
  }

  .shadow-box.float {
    background: var(--float-surface);
    border: 1px solid var(--float-border);
  }

  .button-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }
</style>
