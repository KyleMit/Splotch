<script lang="ts">
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';

  const harnesses = [
    {
      href: '/dev/design',
      name: 'Design tokens',
      blurb: 'Live styleguide of every token and primitive.',
    },
    {
      href: '/dev/engine',
      name: 'Drawing engine',
      blurb: 'Bare canvas harness driven by the Playwright specs.',
    },
    {
      href: '/dev/ai-timer',
      name: 'AI render timer',
      blurb: 'Debug view for the generation timer animation.',
    },
  ];
</script>

<svelte:head>
  <title>Splotch dev harnesses</title>
</svelte:head>

<main class="index">
  <Breadcrumb current="Dev harnesses" />

  <h1>Dev harnesses</h1>
  <p class="intro">
    Development-only pages, unlocked under <code>vite dev</code> or with
    <code>PUBLIC_ENABLE_DEV_HARNESS=true</code>. They 404 in production.
  </p>

  <ul class="harness-list">
    {#each harnesses as harness (harness.href)}
      <li>
        <a href={harness.href}>{harness.name}</a>
        <span class="blurb">{harness.blurb}</span>
        <code>{harness.href}</code>
      </li>
    {/each}
  </ul>
</main>

<style>
  .index {
    min-height: 100dvh;
    padding: var(--space-6);
    background: var(--app-bg);
    color: var(--text);
    user-select: text;
    -webkit-user-select: text;
  }

  h1 {
    color: var(--text-strong);
    font-size: var(--font-size-3xl);
  }

  .intro {
    max-width: 60ch;
    margin: var(--space-2) 0 var(--space-6);
    font-size: var(--font-size-md);
  }

  .harness-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 60ch;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  a {
    color: var(--brand-text);
    font-size: var(--font-size-lg);
    font-weight: 600;
  }

  .blurb {
    font-size: var(--font-size-md);
  }

  code {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }
</style>
