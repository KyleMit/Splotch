<script lang="ts">
  import { page } from '$app/state';
  import { DRAWING_ROUTE } from '$lib/boot/appSurfaceRoute';
  import { paletteHex } from '$lib/palette';
  import releases from '$lib/releases.json';
  import { FEEDBACK_URL } from '$lib/siteUrl';
  import ExternalMark from '../design/ExternalMark.svelte';
  import SplotchyIcon from '../SplotchyIcon.svelte';

  const latest = releases[0];
  const sections = [
    { id: 'privacy', label: 'Privacy', color: paletteHex('Purple') },
    { id: 'changelog', label: 'Changelog', color: paletteHex('Blue') },
    { id: 'feedback', label: 'Send feedback', color: paletteHex('Green') },
  ];
  const currentSection = $derived(page.status === 200 ? page.url.pathname.split('/')[1] : null);
  const releaseHref = $derived(
    `${currentSection === 'changelog' ? '' : '/changelog'}#${latest.id}`
  );
</script>

<footer class="page-footer" style:--footer-rule-color={paletteHex('Orange')}>
  <div class="page-footer-rule" aria-hidden="true"></div>
  <div class="footer-row">
    <a class="footer-brand" href={DRAWING_ROUTE}>
      <SplotchyIcon class="footer-mark" aria-hidden="true" />
      <span class="wordmark">Splotch</span>
    </a>
    <nav aria-label="Splotch pages">
      <ul role="list">
        {#each sections as section (section.id)}
          <li>
            {#if currentSection === section.id && !(__IS_CAPACITOR__ && section.id === 'feedback')}
              <span class="current" aria-current="page">
                <span class="paint-dot" style:background={section.color} aria-hidden="true"></span>
                {section.label}
              </span>
            {:else if __IS_CAPACITOR__ && section.id === 'feedback'}
              <a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">
                {section.label}<ExternalMark variant="inline" />
              </a>
            {:else}
              <a href="/{section.id}">{section.label}</a>
            {/if}
          </li>
        {/each}
      </ul>
    </nav>
  </div>
  <p class="version">
    Splotch {latest.version} · released <time datetime={latest.datetime}>{latest.dateLabel}</time> ·
    <a href={releaseHref}>What's new</a>
  </p>
</footer>

<style>
  .page-footer {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin-top: var(--space-8);
  }

  .page-footer-rule {
    height: 8px;
    background: color-mix(
      in srgb,
      var(--footer-rule-color) var(--squiggle-strength),
      var(--page-sheet)
    );
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='8'%3E%3Cpath d='M0 4 Q6 0 12 4 T24 4' fill='none' stroke='black' stroke-width='2.5' stroke-linecap='round'/%3E%3C/svg%3E")
      repeat-x left center / 24px 8px;
  }

  .footer-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  .footer-brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 44px;
    text-decoration: none;
    color: var(--page-body);
  }

  .footer-brand :global(.footer-mark) {
    width: 24px;
    height: 24px;
  }

  .wordmark {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  ul {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) 18px;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  nav a,
  .current {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
  }

  a:not(.footer-brand) {
    color: var(--page-link);
    text-underline-offset: 3px;
    text-decoration-thickness: 1px;
  }

  .current {
    gap: 6px;
    color: var(--page-ink);
    font-weight: var(--font-weight-bold);
  }

  .paint-dot {
    flex: 0 0 10px;
    height: 10px;
    border-radius: var(--radius-blob-1);
  }

  .version {
    margin: 0;
    color: var(--page-muted);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
  }

  .version a {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
  }

  @media (hover: hover) {
    a:not(.footer-brand):hover {
      text-decoration-thickness: 2px;
    }
  }

  @media (max-width: 540px) {
    ul {
      column-gap: var(--space-2);
    }

    .footer-row {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  @media (max-height: 500px) {
    .page-footer {
      margin-top: var(--space-6);
    }
  }

  @media (forced-colors: active) {
    .page-footer-rule {
      border-top: 2px solid CanvasText;
      height: 0;
      mask: none;
    }

    .paint-dot {
      border: 1px solid CanvasText;
    }
  }
</style>
