<script lang="ts">
  import Icon from '../Icon.svelte';
  import SplotchyIcon from '../SplotchyIcon.svelte';
  import { settings, setAdminLinkVisible } from '$lib/state/settings.svelte';
  // Generated at build time from releases/*.md (see scripts/generate-releases.mjs).
  import releases from '$lib/releases.json';

  const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

  // The most recent release powers the "What's New" block.
  const latestRelease = releases[0];
  const RELEASES_URL = 'https://github.com/KyleMit/Splotch/releases';

  // Hidden admin unlock: tapping the version text 5 times reveals the link to
  // the admin console. The reveal is persisted (so it survives a refresh) and
  // stays put for anyone holding an admin session; the console resets it on
  // logout / failed login / leaving without signing in. The secret itself is
  // collected by the console's login form, so it never touches the client.
  // The web console (/admin) is server-rendered with a cookie session; the
  // native build is a static export with no server, so it gets /admin/native,
  // which manages the same tokens through the hosted /api/admin endpoints.
  //
  // This is a build-time choice, not a runtime one: the native bundle has no
  // /admin route at all (it's server-only, excluded from the static export),
  // and Capacitor's WebView can't reach it. Using the compile-time __IS_CAPACITOR__
  // flag avoids a subtle bug — a runtime isNative() read inside a $derived
  // memoizes on first render, and if window.Capacitor isn't injected yet it
  // sticks on '/admin', whose full-navigation white-screens in the WebView.
  let versionClicks = $state(0);
  let showAdminLink = $derived(settings.adminLinkVisible);
  const adminHref =
    typeof __IS_CAPACITOR__ !== 'undefined' && __IS_CAPACITOR__ ? '/admin/native' : '/admin';
  function handleVersionClick() {
    versionClicks += 1;
    if (versionClicks < 5) return;
    versionClicks = 0;
    setAdminLinkVisible(true);
  }
</script>

<section class="setting-group">
  <div class="about-brand">
    <SplotchyIcon class="about-icon" aria-label="Splotch" role="img" />
    <p class="about-tagline">
      A joyful, kid-friendly drawing app — no ads, no tracking, no accounts.
    </p>
  </div>

  {#if latestRelease}
    <div class="whats-new">
      <h3 class="whats-new-heading">
        What's New <span class="whats-new-version">v{latestRelease.version}</span>
      </h3>
      <!-- eslint-disable-next-line svelte/no-at-html-tags bodyHtml is our own first-party Markdown rendered to HTML at build time -->
      <div class="whats-new-body">{@html latestRelease.bodyHtml}</div>
      <p class="all-releases">
        <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">See all releases →</a>
      </p>
    </div>
  {/if}

  <div class="parent-help-footer">
    <p>
      Having issues? <a
        href="https://github.com/KyleMit/Splotch/issues/new/choose"
        target="_blank"
        rel="noopener noreferrer">Report a problem</a
      >
    </p>
    <p><a href="/privacy">Privacy Policy</a> — no ads, no tracking, no accounts.</p>
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
  /* About tab branding */
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
    font-size: 14px;
    color: var(--text-mid);
    line-height: 1.5;
    max-width: 320px;
  }

  .whats-new {
    margin-bottom: 24px;
    padding: 16px;
    background: var(--surface-2);
    border-radius: 12px;
  }

  .whats-new-heading {
    margin: 0 0 10px 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--text-strong);
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .whats-new-version {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-faint);
  }

  /* Content is build-time-rendered Markdown, so style its tags globally. */
  .whats-new-body :global(h2),
  .whats-new-body :global(h3) {
    margin: 12px 0 6px 0;
    font-size: 14px;
    font-weight: 700;
    color: var(--text-strong);
  }

  .whats-new-body :global(h2:first-child),
  .whats-new-body :global(h3:first-child) {
    margin-top: 0;
  }

  .whats-new-body :global(ul) {
    margin: 0;
    padding-left: 20px;
  }

  .whats-new-body :global(li) {
    font-size: 14px;
    color: var(--text);
    line-height: 1.5;
    margin-bottom: 4px;
  }

  .whats-new-body :global(a) {
    color: var(--brand-text);
  }

  .all-releases {
    margin: 12px 0 0 0;
    font-size: 13px;
  }

  .all-releases a {
    color: var(--brand-text);
    text-decoration: none;
    font-weight: 600;
  }

  @media (hover: hover) {
    .all-releases a:hover {
      text-decoration: underline;
    }
  }

  .parent-help-footer {
    padding-top: 20px;
    border-top: 1px solid var(--border);
    text-align: center;
    color: var(--text-faint);
    font-size: 14px;
  }

  .parent-help-footer p {
    margin: 0 0 8px 0;
  }

  .parent-help-footer a {
    color: var(--brand);
    text-decoration: none;
    font-weight: 500;
  }

  @media (hover: hover) {
    .parent-help-footer a:hover {
      text-decoration: underline;
    }
  }

  .github-link {
    margin: 12px 0 !important;
  }

  .github-link a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text-mid);
    font-size: 14px;
    transition: color 0.2s ease;
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
    transition: opacity 0.2s ease;
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
    font-size: 12px;
    color: var(--text-faint);
    font-family: 'Courier New', monospace;
    user-select: none;
  }

  .admin-link {
    font-size: 12px;
  }
</style>
