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
</script>

<script lang="ts">
  import Icon from '../Icon.svelte';
  import Breadcrumb from '../Breadcrumb.svelte';

  let {
    authed,
    invites,
    persistent = true,
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
    // Defaults to `true` so the native door (which can't know) never warns.
    persistent?: boolean;
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

  // Compact "3 days ago" label for a last-used timestamp, falling back to a
  // plain date if the value won't parse.
  function timeAgo(iso: string) {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const secondsAgo = Math.round((Date.now() - then) / 1000);
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    const units: [Intl.RelativeTimeFormatUnit, number][] = [
      ['year', 31_536_000],
      ['month', 2_592_000],
      ['week', 604_800],
      ['day', 86_400],
      ['hour', 3_600],
      ['minute', 60],
    ];
    for (const [unit, secs] of units) {
      if (Math.abs(secondsAgo) >= secs) return rtf.format(-Math.round(secondsAgo / secs), unit);
    }
    return rtf.format(-secondsAgo, 'second');
  }

  // Detail shown on hover/long-press, for auditing a token that looks busy.
  function usageDetail(usage: Usage) {
    const parts = [`First used ${new Date(usage.firstUsed).toLocaleString()}`];
    if (usage.lastStyle) parts.push(`Last style: ${usage.lastStyle}`);
    if (usage.lastPrompt) parts.push(`Last prompt: ${usage.lastPrompt}`);
    return parts.join('\n');
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

  // The narrow layout collapses the per-row actions into a single "Copy" plus a
  // "⋯" button that opens this modal sheet — the same Copy code / Copy link /
  // Remove actions, just one tap deeper. `menuInvite` is the row it belongs to.
  let menuInvite = $state<Invite | null>(null);
  let menuEl = $state<HTMLDialogElement>();

  function openMenu(invite: Invite) {
    menuInvite = invite;
    menuEl?.showModal();
  }
  function closeMenu() {
    menuEl?.close();
  }
  // A click whose target is the <dialog> itself (not its content) landed on the
  // ::backdrop, so dismiss.
  function onMenuClick(event: MouseEvent) {
    if (event.target === menuEl) closeMenu();
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
          <button type="submit" class="btn btn-primary" disabled={busy}>Sign in</button>
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
                    class:copied={copied === `${invite.token}:code`}
                    onclick={() => copy(`${invite.token}:code`, invite.token)}
                  >
                    {copied === `${invite.token}:code` ? 'Copied!' : 'Copy code'}
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost"
                    class:copied={copied === `${invite.token}:url`}
                    onclick={() => copy(`${invite.token}:url`, invite.url)}
                  >
                    {copied === `${invite.token}:url` ? 'Copied!' : 'Copy link'}
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
                    class:copied={copied === `${invite.token}:code`}
                    onclick={() => copy(`${invite.token}:code`, invite.token)}
                  >
                    {copied === `${invite.token}:code` ? 'Copied!' : 'Copy'}
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

  <dialog
    class="more-menu"
    bind:this={menuEl}
    onclick={onMenuClick}
    onclose={() => (menuInvite = null)}
  >
    {#if menuInvite}
      {@const inv = menuInvite}
      <div class="more-menu-card">
        <p class="more-menu-title">{inv.token}</p>
        <button
          type="button"
          class="more-menu-item"
          onclick={() => {
            copy(`${inv.token}:code`, inv.token);
            closeMenu();
          }}
        >
          Copy code
        </button>
        <button
          type="button"
          class="more-menu-item"
          onclick={() => {
            copy(`${inv.token}:url`, inv.url);
            closeMenu();
          }}
        >
          Copy link
        </button>
        <button
          type="button"
          class="more-menu-item more-menu-item-danger"
          disabled={busy}
          onclick={() => {
            closeMenu();
            run(() => onremove(inv.token));
          }}
        >
          Remove
        </button>
      </div>
    {/if}
  </dialog>
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
    font-family: 'Courier New', monospace;
    font-size: 0.92em;
    background: #fdefc7;
    padding: 1px 5px;
    border-radius: 5px;
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
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .add-form input:focus {
    outline: none;
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(171, 113, 225, 0.18);
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
    font-size: 14px;
    font-weight: 600;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    transition:
      background 0.15s ease,
      color 0.15s ease,
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

  .btn-primary {
    padding: 11px 18px;
    color: #fff;
    background: var(--brand);
    flex-shrink: 0;
  }

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it stuck until the next tap elsewhere. */
  @media (hover: hover) {
    .btn-primary:hover {
      background: var(--brand-hover);
    }
  }

  .btn-ghost {
    padding: 8px 14px;
    color: #7c4dcf;
    background: #f5f0fc;
  }

  @media (hover: hover) {
    .btn-ghost:hover {
      background: #ece0fb;
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
      background: #f0f0f0;
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
    border-bottom: 1px solid #f0f0f0;
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
    color: #777;
  }

  .usage strong {
    color: #7c4dcf;
    font-weight: 700;
  }

  .usage-sep {
    margin: 0 4px;
    color: #ccc;
  }

  .usage-none {
    font-style: italic;
    color: #aaa;
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

  /* Modal sheet opened by the "⋯" button on narrow screens. */
  .more-menu {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 0;
    width: min(340px, calc(100vw - 48px));
    padding: 0;
    border: none;
    border-radius: 18px;
    background: #fff;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.25);
  }

  .more-menu::backdrop {
    background: rgba(20, 16, 30, 0.45);
  }

  .more-menu-title {
    margin: 0;
    padding: 16px 20px 12px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #aaa;
    border-bottom: 1px solid #f0f0f0;
  }

  .more-menu-item {
    display: block;
    width: 100%;
    padding: 16px 20px;
    text-align: left;
    font-family: inherit;
    font-size: 16px;
    font-weight: 600;
    color: #7c4dcf;
    background: transparent;
    border: none;
    border-bottom: 1px solid #f0f0f0;
    cursor: pointer;
  }

  .more-menu-item:last-child {
    border-bottom: none;
  }

  @media (hover: hover) {
    .more-menu-item:hover {
      background: #faf7ff;
    }
  }

  .more-menu-item-danger {
    color: #d92d20;
  }

  @media (hover: hover) {
    .more-menu-item-danger:hover {
      background: #fff5f5;
    }
  }

  .more-menu-item:disabled {
    opacity: 0.6;
    cursor: default;
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
