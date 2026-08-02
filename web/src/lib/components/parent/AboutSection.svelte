<script lang="ts">
  import Icon from '../Icon.svelte';
  import SplotchyIcon from '../SplotchyIcon.svelte';
  import { APP_VERSION } from '$lib/appVersion';

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
        href="https://github.com/KyleMit/Splotch"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View source on GitHub"
      >
        <Icon name="github" class="github-icon" aria-label="GitHub" role="img" />
        View on GitHub
      </a>
    </p>
    <p class="version-text">Version {APP_VERSION}</p>
    {#if import.meta.env.DEV}
      <p class="dev-link"><a href="/dev/ai-timer">AI Timer</a></p>
    {/if}
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
    font-size: var(--font-size-md);
    color: var(--text-mid);
    line-height: 1.5;
    max-width: 320px;
  }

  .about-links {
    padding-top: 20px;
    border-top: 1px solid var(--border);
    text-align: center;
    color: var(--text-faint);
    font-size: var(--font-size-md);
  }

  .about-links p {
    margin: 0 0 8px 0;
  }

  .about-links a {
    color: var(--brand);
    text-decoration: none;
    font-weight: 500;
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
    color: var(--text-mid);
    font-size: var(--font-size-md);
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
    opacity: 0.8;
    transition: opacity var(--duration-base) ease;
  }

  @media (hover: hover) {
    .github-link a:hover :global(.github-icon) {
      opacity: 1;
    }
  }

  .version-text {
    font-size: var(--font-size-xs);
    color: var(--text-faint);
    font-family: var(--font-mono);
  }

  .dev-link {
    font-size: var(--font-size-xs);
  }
</style>
