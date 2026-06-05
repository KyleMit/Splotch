<script>
  import { enhance } from '$app/forms';
  import Icon from '$lib/components/Icon.svelte';
  import { setAdminLinkVisible } from '$lib/state/settings.svelte.js';

  // `data.authed` tells us whether the request carried a valid admin session
  // cookie. When false we render a login form; otherwise the tokens and prebuilt
  // invite links arrive via `data`. The secret never reaches the client.
  let { data, form } = $props();

  // Keep the public /admin link (in the About tab) in sync with reality: it
  // stays visible exactly while an admin_session cookie is present. Logging in
  // sets the cookie (→ visible); logging out, a failed login, or arriving/leaving
  // without one all resolve to no cookie (→ hidden). `data.hasSession` re-reads
  // on every load, including the redirects that follow login and logout.
  $effect(() => {
    setAdminLinkVisible(data.hasSession);
  });

  // Per-row "copied" feedback for the invite links.
  let copied = $state('');
  async function copyLink(url) {
    try {
      await navigator.clipboard.writeText(url);
      copied = url;
      setTimeout(() => {
        if (copied === url) copied = '';
      }, 1500);
    } catch {
      // Clipboard may be unavailable (e.g. non-secure context); ignore.
    }
  }
</script>

<div class="admin-page">
  <main class="admin">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/" class="crumb">
        <Icon name="home" class="crumb-icon" />
        <span>Home</span>
      </a>
      <span class="crumb-sep" aria-hidden="true">/</span>
      <span class="crumb crumb-current" aria-current="page">Admin</span>
    </nav>

    <header class="admin-header">
      <span class="admin-badge"><Icon name="lock" class="badge-icon" /></span>
      <div>
        <h1>Admin</h1>
        <p class="subtitle">Manage AI access codes</p>
      </div>
      {#if data.authed}
        <form method="POST" action="?/logout" use:enhance class="logout-form">
          <button type="submit" class="btn btn-ghost">Sign out</button>
        </form>
      {/if}
    </header>

    {#if !data.authed}
      <section class="card">
        <h2>Sign in</h2>
        {#if form?.loginError}
          <div class="flash flash-error" role="alert">{form.loginError}</div>
        {/if}
        <form method="POST" action="?/login" use:enhance class="add-form">
          <input
            type="password"
            name="access-key"
            placeholder="Admin access key"
            autocomplete="current-password"
            autocapitalize="off"
            spellcheck="false"
            required
          />
          <button type="submit" class="btn btn-primary">Sign in</button>
        </form>
      </section>
    {:else}
    {#if form?.error}
      <div class="flash flash-error" role="alert">{form.error}</div>
    {:else if form?.message}
      <div class="flash flash-success" role="status">{form.message}</div>
    {/if}

    <section class="card">
      <h2>Add a code</h2>
      <form method="POST" action="?/add" use:enhance class="add-form">
        <input
          type="text"
          name="token"
          placeholder="e.g. sunny-meadow"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          required
        />
        <button type="submit" class="btn btn-primary">Add code</button>
      </form>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>Access codes</h2>
        <span class="count">{data.invites.length}</span>
      </div>

      {#if data.invites.length === 0}
        <div class="empty">
          <Icon name="wand-stars" class="empty-icon" />
          <p>No access codes yet. Add one above to start handing out invites.</p>
        </div>
      {:else}
        <ul class="invites">
          {#each data.invites as invite (invite.token)}
            <li class="invite">
              <div class="invite-info">
                <span class="token">{invite.token}</span>
                <a class="invite-url" href={invite.url}>{invite.url}</a>
              </div>
              <div class="invite-actions">
                <button
                  type="button"
                  class="btn btn-ghost"
                  class:copied={copied === invite.url}
                  onclick={() => copyLink(invite.url)}
                >
                  {copied === invite.url ? 'Copied!' : 'Copy link'}
                </button>
                <form method="POST" action="?/remove" use:enhance>
                  <input type="hidden" name="token" value={invite.token} />
                  <button type="submit" class="btn btn-danger" aria-label={`Remove ${invite.token}`}>
                    <Icon name="trash" class="trash-icon" />
                  </button>
                </form>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
    {/if}
  </main>
</div>

<style>
  /* The global app.css locks the body (no scroll, no text selection) for the
     drawing canvas. The admin page is a normal document, so it opts back in. */
  .admin-page {
    position: fixed;
    inset: 0;
    overflow-y: auto;
    background: #f5f5f5;
    -webkit-user-select: text;
    user-select: text;
    -webkit-overflow-scrolling: touch;
  }

  .admin {
    max-width: 640px;
    margin: 0 auto;
    padding: clamp(20px, 5vw, 48px) 16px 64px;
    font-family: 'Quicksand Variable', 'Quicksand', sans-serif;
    color: #333;
  }

  /* Breadcrumb back to the drawing app */
  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 20px;
    font-size: 14px;
    font-weight: 600;
  }

  .crumb {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #7c4dcf;
    text-decoration: none;
    padding: 4px 8px;
    border-radius: 8px;
    transition: background 0.15s ease;
  }

  a.crumb:hover {
    background: #f0e9fb;
  }

  :global(.crumb .crumb-icon) {
    width: 16px;
    height: 16px;
    filter: invert(33%) sepia(58%) saturate(1093%) hue-rotate(238deg) brightness(88%) contrast(89%);
  }

  .crumb-sep {
    color: #ccc;
  }

  .crumb-current {
    color: #999;
    cursor: default;
  }

  .admin-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 28px;
  }

  /* Push the sign-out control to the far end of the header row. */
  .logout-form {
    margin-left: auto;
  }

  .admin-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    border-radius: 16px;
    background: linear-gradient(135deg, var(--brand), #7c4dcf);
    box-shadow: 0 6px 16px rgba(124, 77, 207, 0.35);
    flex-shrink: 0;
  }

  :global(.admin-badge .badge-icon) {
    width: 26px;
    height: 26px;
    filter: brightness(0) invert(1);
  }

  h1 {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .subtitle {
    margin: 2px 0 0;
    color: #888;
    font-size: 15px;
    font-weight: 500;
  }

  /* Flash messages */
  .flash {
    padding: 12px 16px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 20px;
  }

  .flash-success {
    background: #ecfdf3;
    color: #1f7a4d;
    border: 1px solid #b6f0cf;
  }

  .flash-error {
    background: #fef2f2;
    color: #b42318;
    border: 1px solid #fbd5d2;
  }

  /* Cards */
  .card {
    background: #fff;
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 20px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
  }

  .card h2 {
    margin: 0 0 16px;
    font-size: 18px;
    font-weight: 600;
    color: #444;
  }

  .card-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
  }

  .card-head h2 {
    margin: 0;
  }

  .count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 8px;
    border-radius: 12px;
    background: #f0e9fb;
    color: #7c4dcf;
    font-size: 13px;
    font-weight: 700;
  }

  /* Add form */
  .add-form {
    display: flex;
    gap: 10px;
  }

  .add-form input {
    flex: 1;
    min-width: 0;
    padding: 11px 14px;
    font-size: 15px;
    font-family: inherit;
    border: 1px solid #ddd;
    border-radius: 10px;
    background: #fff;
    color: #333;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .add-form input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(171, 113, 225, 0.18);
  }

  /* Buttons */
  .btn {
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, transform 0.05s ease;
    white-space: nowrap;
  }

  .btn:active {
    transform: translateY(1px);
  }

  .btn-primary {
    padding: 11px 18px;
    color: #fff;
    background: var(--brand);
    flex-shrink: 0;
  }

  .btn-primary:hover {
    background: var(--brand-hover);
  }

  .btn-ghost {
    padding: 8px 14px;
    color: #7c4dcf;
    background: #f5f0fc;
  }

  .btn-ghost:hover {
    background: #ece0fb;
  }

  .btn-ghost.copied {
    color: #1f7a4d;
    background: #ecfdf3;
  }

  .btn-danger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    padding: 0;
    color: #b42318;
    background: #fef2f2;
  }

  .btn-danger:hover {
    background: #fbe0de;
  }

  :global(.btn-danger .trash-icon) {
    width: 18px;
    height: 18px;
  }

  /* Invite list */
  .invites {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .invite {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border: 1px solid #eee;
    border-radius: 12px;
    background: #fafafa;
  }

  .invite-info {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .token {
    font-weight: 700;
    font-size: 15px;
    color: #333;
  }

  .invite-url {
    font-family: 'Courier New', monospace;
    font-size: 12.5px;
    color: #999;
    text-decoration: none;
    word-break: break-all;
  }

  .invite-url:hover {
    color: #7c4dcf;
    text-decoration: underline;
  }

  .invite-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  /* Empty state */
  .empty {
    text-align: center;
    padding: 24px 12px;
    color: #999;
  }

  :global(.empty .empty-icon) {
    width: 40px;
    height: 40px;
    opacity: 0.4;
    margin-bottom: 10px;
  }

  .empty p {
    margin: 0;
    font-size: 14px;
    max-width: 320px;
    margin-inline: auto;
  }

  @media (max-width: 480px) {
    .invite {
      flex-direction: column;
      align-items: stretch;
    }

    .invite-actions {
      justify-content: flex-end;
    }
  }
</style>
