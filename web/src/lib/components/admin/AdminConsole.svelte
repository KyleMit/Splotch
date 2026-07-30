<script module lang="ts">
  // Presentational shell for the admin console, shared by the two front doors:
  // /admin (web, server-rendered with form actions + cookie session) and
  // /admin/native (native apps, JSON API + bearer session). The pages own the
  // auth transport and data; this component owns the markup, styles, and
  // small interaction state (copy feedback, clearing inputs). Callbacks return
  // whether the operation succeeded so the component knows when to reset.
  // Per-token AI generation tally (mirrors $lib/server/usage TokenUsage). Kept
  // structural here so this client component never imports server code.
  export interface Usage {
    count: number;
    firstUsed: string;
    lastUsed: string;
    lastStyle: string | null;
    lastPrompt: string;
  }
  export interface Invite {
    token: string;
    url: string;
    // `undefined` = usage tracking isn't wired up for this front door (native);
    // `null` = tracked but never used; an object = the tally. The component
    // renders the stats line only when this is not `undefined`.
    usage?: Usage | null;
  }
  export interface Flash {
    kind: 'success' | 'error';
    text: string;
  }
  export type CopyTarget = 'code' | 'url';
  export const copyKey = (token: string, target: CopyTarget) => `${token}:${target}`;
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '../Icon.svelte';
  import Breadcrumb from '../Breadcrumb.svelte';
  import InviteMenu from './InviteMenu.svelte';
  import { timeAgo, usageDetail } from '$lib/adminFormat';

  let {
    authed,
    invites,
    persistent,
    flash = null,
    loginError = null,
    onlogin,
    onlogout,
    onadd,
    onremove,
  }: {
    authed: boolean;
    invites: Invite[];
    // `false` = Netlify Blobs is unavailable, so this list is the per-instance
    // in-memory copy seeded from env vars and edits won't survive a restart.
    persistent: boolean;
    flash?: Flash | null;
    loginError?: string | null;
    onlogin: (key: string) => Promise<boolean>;
    onlogout: () => Promise<void>;
    onadd: (token: string) => Promise<boolean>;
    onremove: (token: string) => Promise<void>;
  } = $props();

  let loginKey = $state('');
  let newToken = $state('');
  // Guard against double-submits while a request is in flight.
  let busy = $state(false);

  // Every form here submits through a callback and cancels the native submit, so
  // before hydration there is nothing to cancel it: the browser default-submits
  // the form, and with no `action`/`method` that is a GET to the current URL with
  // each field as a query param. On the login card that puts the admin access key
  // in the address bar, browser history, and every access log on the way — while
  // logging nobody in. Keeping the submit disabled until mount closes that
  // window, and Playwright's own actionability wait then makes hydration the gate
  // a spec waits on for free (issue #615, whose reported failure was this GET:
  // `navigated to "/admin?access-key=…"`). Login already required JS, so nothing
  // that worked stops working — it just fails visibly instead of leaking.
  let hydrated = $state(false);
  onMount(() => {
    hydrated = true;
  });

  // Callbacks that reject (e.g. a fetch failing offline) would otherwise be
  // unhandled rejections with no UI feedback, so catch here and surface a
  // generic message in whichever branch (login card or console) is visible.
  let runError = $state<string | null>(null);

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    busy = true;
    runError = null;
    try {
      await fn();
    } catch {
      runError = 'Something went wrong. Check your connection and try again.';
    } finally {
      busy = false;
    }
  }

  let shownLoginError = $derived(runError ?? loginError);
  let shownFlash = $derived<Flash | null>(runError ? { kind: 'error', text: runError } : flash);

  function handleLogin(event: SubmitEvent) {
    event.preventDefault();
    run(async () => {
      if (await onlogin(loginKey)) loginKey = '';
    });
  }

  function handleAdd(event: SubmitEvent) {
    event.preventDefault();
    run(async () => {
      if (await onadd(newToken.trim())) newToken = '';
    });
  }

  // Per-button "copied" feedback. The key distinguishes which cell flashed
  // (e.g. `token:code` vs `token:url`) so only the clicked button reacts.
  let copied = $state('');
  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = key;
      setTimeout(() => {
        if (copied === key) copied = '';
      }, 1500);
    } catch {
      // Clipboard may be unavailable (e.g. non-secure context); ignore.
    }
  }

  // The row the overflow menu belongs to, or null when it's closed.
  let menuInvite = $state<Invite | null>(null);
  let inviteMenu = $state<ReturnType<typeof InviteMenu>>();

  function openMenu(invite: Invite) {
    menuInvite = invite;
    inviteMenu?.open();
  }
</script>

<div class="admin-page">
  <main class="admin">
    <Breadcrumb current="Admin" />

    <header class="admin-header">
      <span class="admin-badge"><Icon name="lock" class="badge-icon" /></span>
      <div>
        <h1>Admin</h1>
        <p class="subtitle">Manage AI access codes</p>
      </div>
      {#if authed}
        <button
          type="button"
          class="btn btn-ghost logout-button"
          disabled={busy}
          onclick={() => run(onlogout)}
        >
          Sign out
        </button>
      {/if}
    </header>

    {#if !authed}
      <section class="card">
        <h2>Sign in</h2>
        {#if shownLoginError}
          <div class="flash flash-error" role="alert">{shownLoginError}</div>
        {/if}
        <form onsubmit={handleLogin} class="add-form">
          <input
            type="password"
            name="access-key"
            placeholder="Admin access key"
            autocomplete="current-password"
            autocapitalize="off"
            spellcheck="false"
            required
            bind:value={loginKey}
          />
          <button type="submit" class="btn btn-primary" disabled={busy || !hydrated}>
            Sign in
          </button>
        </form>
      </section>
    {:else}
      {#if !persistent}
        <div class="flash flash-warning" role="alert">
          <strong>Netlify Blobs is unavailable.</strong> You're viewing a local-only copy seeded
          from the <code>ALLOWED_TOKENS_LIST</code> env var. Any codes you add or remove here won't be
          saved and may reset at any time.
        </div>
      {/if}

      {#if shownFlash}
        <div
          class="flash"
          class:flash-error={shownFlash.kind === 'error'}
          class:flash-success={shownFlash.kind === 'success'}
          role={shownFlash.kind === 'error' ? 'alert' : 'status'}
        >
          {shownFlash.text}
        </div>
      {/if}

      <form onsubmit={handleAdd} class="add-form add-bar">
        <input
          type="text"
          name="token"
          placeholder="Add a code…"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          required
          bind:value={newToken}
        />
        <button
          type="submit"
          class="btn btn-primary add-button"
          disabled={busy}
          aria-label="Add code"
        >
          <span class="add-label">Add code</span>
          <Icon name="plus" class="add-icon" />
        </button>
      </form>

      <section class="card">
        <div class="card-head">
          <h2>Access codes</h2>
          <span class="count">{invites.length}</span>
        </div>

        {#if invites.length === 0}
          <div class="empty">
            <Icon name="wand-stars" class="empty-icon" />
            <p>No access codes yet. Add one above to start handing out invites.</p>
          </div>
        {:else}
          <ul class="invites">
            {#each invites as invite (invite.token)}
              <li class="invite">
                <div class="invite-info">
                  <span class="token">{invite.token}</span>
                  {#if invite.usage !== undefined}
                    {#if invite.usage}
                      <span class="usage" title={usageDetail(invite.usage)}>
                        <strong>{invite.usage.count}</strong>
                        {invite.usage.count === 1 ? 'generation' : 'generations'}
                        <span class="usage-sep" aria-hidden="true">·</span>
                        last used {timeAgo(invite.usage.lastUsed)}
                      </span>
                    {:else}
                      <span class="usage usage-none">Never used</span>
                    {/if}
                  {/if}
                </div>

                <div class="invite-actions invite-actions-full">
                  <button
                    type="button"
                    class="btn btn-ghost"
                    class:copied={copied === copyKey(invite.token, 'code')}
                    onclick={() => copy(copyKey(invite.token, 'code'), invite.token)}
                  >
                    {copied === copyKey(invite.token, 'code') ? 'Copied!' : 'Copy code'}
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost"
                    class:copied={copied === copyKey(invite.token, 'url')}
                    onclick={() => copy(copyKey(invite.token, 'url'), invite.url)}
                  >
                    {copied === copyKey(invite.token, 'url') ? 'Copied!' : 'Copy link'}
                  </button>
                  <button
                    type="button"
                    class="btn btn-danger"
                    disabled={busy}
                    aria-label={`Remove ${invite.token}`}
                    onclick={() => run(() => onremove(invite.token))}
                  >
                    Remove
                  </button>
                </div>

                <div class="invite-actions invite-actions-compact">
                  <button
                    type="button"
                    class="btn btn-ghost"
                    class:copied={copied === copyKey(invite.token, 'code')}
                    onclick={() => copy(copyKey(invite.token, 'code'), invite.token)}
                  >
                    {copied === copyKey(invite.token, 'code') ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    class="btn btn-icon"
                    aria-label={`More options for ${invite.token}`}
                    onclick={() => openMenu(invite)}
                  >
                    <Icon name="more-horiz" class="more-icon" />
                  </button>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
  </main>

  <InviteMenu
    bind:this={inviteMenu}
    invite={menuInvite}
    {busy}
    oncopy={copy}
    onremove={(token) => run(() => onremove(token))}
    onclose={() => (menuInvite = null)}
  />
</div>

<style>
  /* Colors here are deliberately raw: the admin console is a light-only
     surface with its own accent palette (the #7c4dcf family, chosen for WCAG
     AA over the failing --brand). The themed color tokens flip with
     data-theme / prefers-color-scheme, so adopting them would half-dark-theme
     this page. Scale tokens (font sizes, radii, durations) are safe and used
     below; theming /admin is a separate decision. */

  /* A full-viewport scroll panel with its own light background. The admin console
     is a normal scrollable, selectable, zoomable document — the drawing-route
     app-surface locks (app.css) don't reach this route, so no opt-out is needed. */
  .admin-page {
    --admin-accent: #7c4dcf;
    --admin-accent-hover: #6b3fbe;
    --admin-accent-tint: #f5f0fc;
    --admin-accent-tint-strong: #f0e9fb;
    --admin-accent-tint-hover: #ece0fb;
    --admin-hairline: #f0f0f0;
    --admin-ink-muted: #666;
    --admin-ink-subtle: #757575;

    position: fixed;
    inset: 0;
    overflow-y: auto;
    background: #f5f5f5;
    -webkit-overflow-scrolling: touch;
  }

  .admin {
    max-width: 640px;
    margin: 0 auto;
    padding: clamp(20px, 5vw, 48px) 16px 64px;
    font-family: var(--font-family);
    color: #333;
  }

  .admin-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 28px;
  }

  /* Push the sign-out control to the far end of the header row. */
  .logout-button {
    margin-left: auto;
  }

  .admin-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    border-radius: var(--radius-lg);
    background: linear-gradient(135deg, var(--brand), var(--admin-accent));
    box-shadow: 0 6px 16px rgba(124, 77, 207, 0.35);
    box-shadow: 0 6px 16px color-mix(in srgb, var(--admin-accent) 35%, transparent);
    flex-shrink: 0;
  }

  :global(.admin-badge .badge-icon) {
    width: 26px;
    height: 26px;
    filter: brightness(0) invert(1);
  }

  h1 {
    margin: 0;
    font-size: var(--font-size-3xl);
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  .subtitle {
    margin: 2px 0 0;
    color: var(--admin-ink-muted);
    font-size: 15px;
    font-weight: 500;
  }

  /* Flash messages */
  .flash {
    padding: 12px 16px;
    border-radius: var(--radius-md);
    font-size: var(--font-size-md);
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

  .flash-warning {
    background: #fffaeb;
    color: #93600b;
    border: 1px solid #fce5a8;
    font-weight: 500;
    line-height: 1.45;
  }

  .flash-warning strong {
    font-weight: 700;
  }

  .flash-warning code {
    font-family: var(--font-mono);
    font-size: 0.92em;
    background: #fdefc7;
    padding: 1px 5px;
    border-radius: 5px;
  }

  /* Cards */
  .card {
    background: #fff;
    border-radius: var(--radius-lg);
    padding: 24px;
    margin-bottom: 20px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
  }

  .card h2 {
    margin: 0 0 16px;
    font-size: var(--font-size-xl);
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
    border-radius: var(--radius-pill);
    background: var(--admin-accent-tint-strong);
    color: var(--admin-accent);
    font-size: var(--font-size-sm);
    font-weight: 700;
  }

  /* Add form (shared by the sign-in card and the standalone add bar) */
  .add-form {
    display: flex;
    gap: 10px;
  }

  /* The add bar sits directly on the page (no card wrapper). */
  .add-bar {
    margin-bottom: 24px;
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
    transition:
      border-color var(--duration-fast) ease,
      box-shadow var(--duration-fast) ease;
  }

  .add-form input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(var(--brand-rgb), 0.18);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 18%, transparent);
  }

  /* The add button shows its "Add code" label by default and collapses to the
     "+" icon only when space is tight (handled in the media query below). */
  .add-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  :global(.add-button .add-icon) {
    display: none;
    width: 22px;
    height: 22px;
    filter: brightness(0) invert(1);
  }

  /* Buttons */
  .btn {
    font-family: inherit;
    font-size: var(--font-size-md);
    font-weight: 600;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    transition:
      background var(--duration-fast) ease,
      color var(--duration-fast) ease,
      transform 0.05s ease;
    white-space: nowrap;
  }

  .btn:active {
    transform: translateY(1px);
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  /* The page's darker accent (#7c4dcf, 4.5:1+ under white text) rather than
     --brand, whose 3.4:1 fails WCAG AA (axe serious). */
  .btn-primary {
    padding: 11px 18px;
    color: #fff;
    background: var(--admin-accent);
    flex-shrink: 0;
  }

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it stuck until the next tap elsewhere. */
  @media (hover: hover) {
    .btn-primary:hover {
      background: var(--admin-accent-hover);
    }
  }

  .btn-ghost {
    padding: 8px 14px;
    color: var(--admin-accent);
    background: var(--admin-accent-tint);
  }

  @media (hover: hover) {
    .btn-ghost:hover {
      background: var(--admin-accent-tint-hover);
    }
  }

  .btn-ghost.copied {
    color: #1f7a4d;
    background: #ecfdf3;
  }

  .btn-danger {
    padding: 8px 14px;
    color: #b42318;
    background: #fef2f2;
  }

  @media (hover: hover) {
    .btn-danger:hover {
      background: #fbe0de;
    }
  }

  /* Square icon-only button (the "⋯" more control). */
  .btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    padding: 0;
    color: #999;
    background: transparent;
  }

  @media (hover: hover) {
    .btn-icon:hover {
      background: var(--admin-hairline);
    }
  }

  :global(.btn-icon .more-icon) {
    width: 20px;
    height: 20px;
    filter: invert(63%) sepia(0%) saturate(0%) hue-rotate(180deg) brightness(95%) contrast(85%);
  }

  /* Invite list — one card of rows split by hairline dividers. */
  .invites {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .invite {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 4px;
    border-bottom: 1px solid var(--admin-hairline);
  }

  .invite:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .invite:first-child {
    padding-top: 0;
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

  .usage {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--admin-ink-muted);
  }

  .usage strong {
    color: var(--admin-accent);
    font-weight: 700;
  }

  .usage-sep {
    margin: 0 4px;
    color: #ccc;
  }

  .usage-none {
    font-style: italic;
    color: var(--admin-ink-subtle);
  }

  .invite-actions {
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    flex-shrink: 0;
  }

  /* Full set of labelled actions for wide screens; the compact Copy + "⋯"
     pair takes over on narrow ones. Only one is shown at a time. */
  .invite-actions-full {
    display: inline-flex;
  }

  .invite-actions-compact {
    display: none;
  }

  /* Empty state. #666, not #999: 2.85:1 on the white card is an axe serious
     the suite can't see (the logged-in scan populates a row first). */
  .empty {
    text-align: center;
    padding: 24px 12px;
    color: var(--admin-ink-muted);
  }

  :global(.empty .empty-icon) {
    width: 40px;
    height: 40px;
    opacity: 0.4;
    margin-bottom: 10px;
  }

  .empty p {
    margin: 0;
    font-size: var(--font-size-md);
    max-width: 320px;
    margin-inline: auto;
  }

  /* On narrow screens the three labelled actions won't fit beside the code, so
     each row collapses to a single "Copy" plus the "⋯" overflow menu, and the
     add button shrinks to just its "+" icon. */
  @media (max-width: 560px) {
    .invite-actions-full {
      display: none;
    }

    .invite-actions-compact {
      display: inline-flex;
    }

    .add-button {
      padding: 11px;
      width: 46px;
      flex-shrink: 0;
    }

    .add-label {
      display: none;
    }

    :global(.add-button .add-icon) {
      display: block;
    }
  }
</style>
