<script lang="ts">
  import Icon from '../Icon.svelte';
  import SplotchyIcon from '../SplotchyIcon.svelte';
  import { APP_VERSION } from '$lib/appVersion';
  import { parentalGateLink } from '$lib/actions/parentalGateLink';
  import { GITHUB_REPO_URL } from '$lib/githubRepo';
  import '$lib/components/deferredIcons';

  // The admin console is reached by typing /admin on the web, and exists only
  // there. It is deliberately not linked from anywhere in the app: an in-app
  // affordance for a privileged surface reads as hidden functionality to a store
  // reviewer (Play Deceptive Behavior, App Review 2.3.1), which a children's app
  // cannot afford.
</script>

<section class="setting-group">
  <div class="about-brand">
    <SplotchyIcon class="about-icon" aria-label="Splotch" role="img" />
    <p class="about-tagline">A joyful, kid-friendly drawing app</p>
  </div>

  <div class="about-links">
    <p><a href="/privacy">Privacy Policy</a></p>
    <p class="github-link">
      <a
        href={GITHUB_REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View source on GitHub"
        use:parentalGateLink
      >
        <Icon name="github" class="github-icon" aria-label="GitHub" role="img" />
        View on GitHub
      </a>
    </p>
    <p class="version-text">Version {APP_VERSION}</p>
  </div>
</section>

<style>
  .about-brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 12px;
    margin-bottom: 24px;
  }

  :global(.about-icon) {
    width: 96px;
    height: 96px;
  }

  .about-tagline {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--text-soft);
    line-height: 1.5;
    max-width: 320px;
  }

  .about-links {
    padding-top: 20px;
    border-top: 1px solid var(--border);
    text-align: center;
    color: var(--text-soft);
    font-size: var(--font-size-sm);
  }

  .about-links p {
    margin: 0 0 8px;
  }

  .about-links a {
    color: var(--brand-text);
    text-decoration: none;
    font-weight: var(--font-weight-medium);
  }

  @media (hover: hover) {
    .about-links a:hover {
      text-decoration: underline;
    }
  }

  .about-links > p.github-link {
    margin: 12px 0;
  }

  .github-link a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-soft);
    font-size: var(--font-size-sm);
    transition: color var(--duration-base) ease;
  }

  @media (hover: hover) {
    .github-link a:hover {
      color: var(--text-strong);
      text-decoration: none;
    }
  }

  :global(.github-icon) {
    width: 20px;
    height: 20px;
  }

  /* Dimmed by ink token, not opacity, as every other glyph in the app is; the
     modal shell's re-ink rule is zero-specificity (:where), so this wins. */
  .github-link :global(.github-icon svg) {
    fill: var(--icon-muted);
    transition: fill var(--duration-base) ease;
  }

  @media (hover: hover) {
    .github-link a:hover :global(.github-icon svg) {
      fill: var(--icon-ink);
    }
  }

  .version-text {
    font-size: var(--font-size-xs);
    color: var(--text-soft);
  }
</style>
