<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../Icon.svelte';
  import { settings, setAdminLinkVisible } from '$lib/state/settings.svelte';
  import { fetchLatestVersion, applyUpdate } from '$lib/pwa/updates';
  // Generated at build time from releases/*.md (see scripts/generate-releases.mjs).
  import releases from '$lib/releases.json';

  const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

  // The update check is web/PWA only — the native apps will eventually surface
  // store updates instead, so the whole block is compiled out of that bundle.
  const IS_NATIVE = typeof __IS_CAPACITOR__ !== 'undefined' && __IS_CAPACITOR__;

  // Background updates keep the app mostly in sync on their own (auto-applied
  // while the canvas is blank). This surfaces the deployed version so a parent
  // can confirm they're current — or force an update mid-drawing if they want.
  type UpdateStatus = 'checking' | 'current' | 'available' | 'updating' | 'error';
  let updateStatus = $state<UpdateStatus>('checking');
  let latestVersion = $state<string | null>(null);

  async function checkVersion() {
    updateStatus = 'checking';
    const version = await fetchLatestVersion();
    if (version === null) {
      updateStatus = 'error';
      return;
    }
    latestVersion = version;
    updateStatus = version === APP_VERSION ? 'current' : 'available';
  }

  async function handleUpdate() {
    updateStatus = 'updating';
    await applyUpdate(latestVersion);
  }

  onMount(() => {
    if (!IS_NATIVE) checkVersion();
  });

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
    <Icon name="splotchy" class="about-icon" aria-label="Splotch" role="img" />
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
    {#if !IS_NATIVE}
      <p class="update-status">
        {#if updateStatus === 'checking'}
          <span class="update-muted">Checking for updates…</span>
        {:else if updateStatus === 'current'}
          <span class="update-current">✓ You're on the latest version</span>
        {:else if updateStatus === 'available'}
          <span class="update-available">Update available — v{latestVersion}</span>
          <button type="button" class="update-button" onclick={handleUpdate}>Update now</button>
        {:else if updateStatus === 'updating'}
          <span class="update-muted">Updating…</span>
        {:else}
          <span class="update-muted">Couldn't check for updates</span>
          <button type="button" class="update-recheck" onclick={checkVersion}>Try again</button>
        {/if}
      </p>
    {/if}
    {#if showAdminLink}
      <p class="admin-link"><a href={adminHref}>Admin</a></p>
    {/if}
    {#if import.meta.env.DEV}
      <p class="admin-link"><a href="/dev/ai-timer">AI Timer</a></p>
    {/if}
  </div>
</section>

<style>
  .setting-group {
    margin-bottom: 24px;
  }

  .setting-group:last-child {
    margin-bottom: 0;
  }

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
    color: #666;
    line-height: 1.5;
    max-width: 320px;
  }

  .whats-new {
    margin-bottom: 24px;
    padding: 16px;
    background: #f7f7f9;
    border-radius: 12px;
  }

  .whats-new-heading {
    margin: 0 0 10px 0;
    font-size: 15px;
    font-weight: 700;
    color: #333;
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .whats-new-version {
    font-size: 13px;
    font-weight: 600;
    color: #999;
  }

  /* Content is build-time-rendered Markdown, so style its tags globally. */
  .whats-new-body :global(h2),
  .whats-new-body :global(h3) {
    margin: 12px 0 6px 0;
    font-size: 14px;
    font-weight: 700;
    color: #444;
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
    color: #555;
    line-height: 1.5;
    margin-bottom: 4px;
  }

  .whats-new-body :global(a) {
    color: #6b5bd2;
  }

  .all-releases {
    margin: 12px 0 0 0;
    font-size: 13px;
  }

  .all-releases a {
    color: #6b5bd2;
    text-decoration: none;
    font-weight: 600;
  }

  .all-releases a:hover {
    text-decoration: underline;
  }

  .parent-help-footer {
    padding-top: 20px;
    border-top: 1px solid #e0e0e0;
    text-align: center;
    color: #999;
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

  .parent-help-footer a:hover {
    text-decoration: underline;
  }

  .github-link {
    margin: 12px 0 !important;
  }

  .github-link a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #666;
    font-size: 14px;
    transition: color 0.2s ease;
  }

  .github-link a:hover {
    color: #333;
    text-decoration: none;
  }

  :global(.github-icon) {
    width: 20px;
    height: 20px;
    opacity: 0.8;
    transition: opacity 0.2s ease;
  }

  .github-link a:hover :global(.github-icon) {
    opacity: 1;
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
    color: #bbb;
    font-family: 'Courier New', monospace;
    user-select: none;
  }

  .admin-link {
    font-size: 12px;
  }

  .update-status {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    margin: 0 0 8px !important;
  }

  .update-muted {
    color: #bbb;
  }

  .update-current {
    color: #2e9e5b;
    font-weight: 600;
  }

  .update-available {
    color: #666;
    font-weight: 600;
  }

  .update-button {
    border: none;
    border-radius: 999px;
    padding: 6px 16px;
    background: var(--brand);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .update-button:hover {
    filter: brightness(1.05);
  }

  .update-recheck {
    border: none;
    background: none;
    padding: 0;
    color: var(--brand);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    text-decoration: underline;
  }
</style>
