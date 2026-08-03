<script lang="ts">
  import Icon from '../Icon.svelte';
  import SplotchyIcon from '../SplotchyIcon.svelte';
  import { APP_VERSION } from '$lib/appVersion';
  import { settings, setAdminLinkVisible } from '$lib/state/settings.svelte';

  // Hidden admin unlock: tapping the version text 5 times reveals the link to
  // the admin console. The reveal is persisted (so it survives a refresh) and
  // stays put for anyone holding an admin session; the console resets it on
  // logout / failed login / leaving without signing in. The secret itself is
  // collected by the console's login form, so it never touches the client.
  //
  // This is a build-time choice, not a runtime one: the native bundle has no
  // /admin route at all (it's server-only, excluded from the static export),
  // and Capacitor's WebView can't reach it. Using the compile-time __IS_CAPACITOR__
  // flag avoids a subtle bug — a runtime isNative() read inside a $derived
  // memoizes on first render, and if window.Capacitor isn't injected yet it
  // sticks on '/admin', whose full-navigation white-screens in the WebView.
  const ADMIN_UNLOCK_TAPS = 5;
  let versionClicks = $state(0);
  let showAdminLink = $derived(settings.adminLinkVisible);
  const adminHref =
    typeof __IS_CAPACITOR__ !== 'undefined' && __IS_CAPACITOR__ ? '/admin/native' : '/admin';
  function handleVersionClick() {
    versionClicks += 1;
    if (versionClicks < ADMIN_UNLOCK_TAPS) return;
    versionClicks = 0;
    setAdminLinkVisible(true);
  }
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
    <button type="button" class="version-text" onclick={handleVersionClick}
      >Version {APP_VERSION}</button
    >
    {#if showAdminLink}
      <p class="admin-link"><a href={adminHref}>Admin</a></p>
    {/if}
    {#if import.meta.env.DEV}
      <p class="admin-link"><a href="/dev/ai-timer">AI Timer</a></p>
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
    margin: 0 0 8px 0;
  }

  .about-links a {
    color: var(--brand);
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
    opacity: 0.8;
    transition: opacity var(--duration-base) ease;
  }

  @media (hover: hover) {
    .github-link a:hover :global(.github-icon) {
      opacity: 1;
    }
  }

  .version-text {
    /* A real <button> for accessibility, reset to look like the plain text it
       replaced (the surrounding footer <p>s are centered with an 8px gap). */
    display: block;
    width: 100%;
    margin: 0 0 8px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    text-align: center;
    font-size: var(--font-size-xs);
    color: var(--text-soft);
    font-family: var(--font-mono);
    user-select: none;
  }

  .admin-link {
    font-size: var(--font-size-xs);
  }
</style>
