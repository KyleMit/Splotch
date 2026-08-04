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
    // renders the usage columns only when this is not `undefined`.
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
  import PageShell from '../page/PageShell.svelte';
  import RuleLabel from '../page/RuleLabel.svelte';
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
  // each field as a query param. Both doors leak a secret that way — the login
  // card puts the admin access key in the address bar, browser history and every
  // access log en route, and the authed page does the same with a freshly minted
  // AI access code — while in neither case doing the thing that was asked.
  //
  // So `submitDisabled` gates *every* submit in this component, not each one on
  // its own: the rule is "no submit is live before hydration", and stating it once
  // is what stops the next form from being added without it. Playwright's own
  // actionability wait then makes hydration the gate a spec waits on for free
  // (issue #615, whose reported failure was this GET:
  // `navigated to "/admin?access-key=…"`). Both flows already required JS, so
  // nothing that worked stops working — it just fails visibly instead of leaking.
  let hydrated = $state(false);
  onMount(() => {
    hydrated = true;
  });

  let submitDisabled = $derived(busy || !hydrated);

  // Callbacks that reject (e.g. a fetch failing offline) would otherwise be
  // unhandled rejections with no UI feedback, so catch here and surface a
  // generic message in whichever branch (login form or console) is visible.
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

<PageShell title="Admin" wordmark="Splotch Admin">
  {#snippet lede()}
    Manage AI access codes
  {/snippet}

  {#snippet actions()}
    {#if authed}
      <button type="button" class="sign-out" disabled={busy} onclick={() => run(onlogout)}>
        Sign out
      </button>
    {/if}
  {/snippet}

  {#if !authed}
    <RuleLabel>Sign in</RuleLabel>
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
      <button type="submit" class="cta" disabled={submitDisabled}>Sign in</button>
    </form>
  {:else}
    {#if !persistent}
      <div class="flash flash-warning" role="alert">
        <strong>Netlify Blobs is unavailable.</strong> You're viewing a local-only copy seeded from
        the <code>ALLOWED_TOKENS_LIST</code> env var. Any codes you add or remove here won't be saved
        and may reset at any time.
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

    <RuleLabel>Access codes · {invites.length}</RuleLabel>

    <form onsubmit={handleAdd} class="add-form">
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
      <button type="submit" class="cta" disabled={submitDisabled} aria-label="Add code">
        <span class="add-label-full">Add code</span><span class="add-label-short">Add</span>
      </button>
    </form>

    {#if invites.length === 0}
      <div class="ledger">
        <div class="empty">
          <Icon name="wand-stars" class="empty-icon" />
          <p>No access codes yet. Add one above to start handing out invites.</p>
        </div>
      </div>
    {:else}
      <!-- Explicit ARIA table roles, not <table> elements: the ledger's rows are
           laid out with grid/flex, and overriding a real table's display strips
           its implicit table semantics in the major engines. The role attributes
           keep the columnheader↔cell associations no matter what the CSS does. -->
      <div class="ledger" role="table" aria-label="Access codes">
        <div role="rowgroup" class="ledger-head">
          <div role="row" class="ledger-head-row">
            <span role="columnheader">Code</span>
            <span role="columnheader">Generations</span>
            <span role="columnheader">Last used</span>
            <span role="columnheader">Actions</span>
          </div>
        </div>
        <div role="rowgroup" class="invites">
          {#each invites as invite (invite.token)}
            <div role="row" class="invite">
              <div role="cell" class="invite-info">
                <span class="token">{invite.token}</span>
                {#if invite.usage !== undefined}
                  {#if invite.usage}
                    <span class="usage-line" title={usageDetail(invite.usage)}>
                      <strong>{invite.usage.count}</strong>
                      {invite.usage.count === 1 ? 'generation' : 'generations'}
                      <span class="usage-sep" aria-hidden="true">·</span>
                      {timeAgo(invite.usage.lastUsed)}
                    </span>
                  {:else}
                    <span class="usage-line usage-none">Never used</span>
                  {/if}
                {/if}
              </div>

              {#if invite.usage}
                <span role="cell" class="cell-gens" title={usageDetail(invite.usage)}>
                  {invite.usage.count}
                </span>
                <span role="cell" class="cell-last">{timeAgo(invite.usage.lastUsed)}</span>
              {:else if invite.usage === null}
                <span role="cell" class="cell-gens cell-none">—</span>
                <span role="cell" class="cell-last cell-none">Never used</span>
              {:else}
                <span role="cell" class="cell-gens"></span>
                <span role="cell" class="cell-last"></span>
              {/if}

              <div role="cell" class="cell-actions">
                <div class="wide-actions">
                  <button
                    type="button"
                    class="copy-btn"
                    class:copied={copied === copyKey(invite.token, 'code')}
                    onclick={() => copy(copyKey(invite.token, 'code'), invite.token)}
                  >
                    {copied === copyKey(invite.token, 'code') ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    class="link-action"
                    class:copied={copied === copyKey(invite.token, 'url')}
                    onclick={() => copy(copyKey(invite.token, 'url'), invite.url)}
                  >
                    {copied === copyKey(invite.token, 'url') ? 'Copied!' : 'Copy link'}
                  </button>
                  <button
                    type="button"
                    class="link-action link-action-danger"
                    disabled={busy}
                    aria-label={`Remove ${invite.token}`}
                    onclick={() => run(() => onremove(invite.token))}
                  >
                    Remove
                  </button>
                </div>

                <div class="compact-actions">
                  <button
                    type="button"
                    class="copy-btn"
                    class:copied={copied === copyKey(invite.token, 'code')}
                    onclick={() => copy(copyKey(invite.token, 'code'), invite.token)}
                  >
                    {copied === copyKey(invite.token, 'code') ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    class="more-btn"
                    aria-label={`More options for ${invite.token}`}
                    onclick={() => openMenu(invite)}
                  >
                    <Icon name="more-horiz" class="more-icon" />
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</PageShell>

<InviteMenu
  bind:this={inviteMenu}
  invite={menuInvite}
  {busy}
  oncopy={copy}
  onremove={(token) => run(() => onremove(token))}
  onclose={() => (menuInvite = null)}
/>

<style>
  /* Flash messages */
  .flash {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    margin-bottom: var(--space-5);
  }

  .flash-success {
    background: var(--success-wash);
    color: var(--success-text);
  }

  .flash-error {
    background: var(--danger-wash);
    color: var(--danger-text);
  }

  /* Warning amber has no token pair yet — the persistence banner is the
     product's only warning surface. The light values stay pinned on both
     themes: the banner is its own surface, so its ink/wash contrast holds
     regardless of the sheet behind it. */
  .flash-warning {
    background: #fffaeb;
    color: #93600b;
    border: 1px solid #fce5a8;
    font-weight: var(--font-weight-medium);
    line-height: 1.45;
  }

  .flash-warning strong {
    font-weight: var(--font-weight-bold);
  }

  .flash-warning code {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    background: #fdefc7;
    padding: 1px 5px;
    border-radius: var(--radius-sm);
  }

  /* Hero Sign out — the brand-wash ghost beside the H1. */
  .sign-out {
    padding: 8px 14px;
    color: var(--brand-text);
    background: var(--brand-wash);
    border: none;
    border-radius: var(--radius-md);
    font-family: inherit;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    white-space: nowrap;
    transition: background var(--duration-fast) ease;
  }

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it stuck until the next tap elsewhere. */
  @media (hover: hover) {
    .sign-out:hover {
      background: var(--brand-wash-hover);
    }
  }

  .sign-out:disabled {
    opacity: 0.6;
    cursor: default;
  }

  /* Add form (shared by the sign-in form and the add bar) */
  .add-form {
    display: flex;
    gap: 10px;
    margin-bottom: var(--space-5);
  }

  .add-form input {
    flex: 1;
    min-width: 0;
    max-width: 420px;
    padding: 13px 16px;
    font-size: var(--input-font-size);
    font-family: inherit;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--text-strong);
    transition:
      border-color var(--duration-fast) ease,
      box-shadow var(--duration-fast) ease;
  }

  .add-form input:focus {
    outline: none;
    border-color: var(--brand-solid);
    /* rgba fallback precedes the color-mix (docs/COMPATIBILITY.md). */
    box-shadow: 0 0 0 3px rgba(var(--brand-rgb), 0.18);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-solid) 18%, transparent);
  }

  /* The standalone pages' solid call to action — the same shape as /feedback's
     submit, so the consoles read as one set with the other parent pages. */
  .cta {
    padding: 15px 24px;
    border: none;
    border-radius: var(--radius-md);
    background: var(--brand-solid);
    color: var(--on-brand);
    font-family: inherit;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background var(--duration-fast) ease;
  }

  @media (hover: hover) {
    .cta:hover {
      background: var(--brand-solid-hover);
    }
  }

  .cta:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .add-label-short {
    display: none;
  }

  /* The ledger — one bordered block of columned rows. Its type runs a step
     finer than the app ramp (11/13/15px sit between the xs and sm steps) so
     four columns fit the sheet; sizes from the approved redesign. */
  .ledger {
    --ledger-columns: 1fr 100px 120px 240px;
    --ledger-label-size: 11px;
    --ledger-meta-size: 13px;
    --ledger-count-size: 15px;

    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .ledger-head-row {
    display: grid;
    grid-template-columns: var(--ledger-columns);
    gap: var(--space-2);
    align-items: center;
    padding: 10px 20px;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
  }

  .ledger-head-row span {
    font-size: var(--ledger-label-size);
    font-weight: var(--font-weight-bold);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-soft);
  }

  .invite {
    display: grid;
    grid-template-columns: var(--ledger-columns);
    gap: var(--space-2);
    align-items: center;
    padding: 12px 20px;
    border-bottom: 1px solid var(--border);
  }

  .invite:last-child {
    border-bottom: none;
  }

  .invite-info {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .token {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    color: var(--text-strong);
    overflow-wrap: anywhere;
  }

  /* The combined count + recency line under the code — narrow layout only;
     the wide layout splits the same facts into the grid columns. */
  .usage-line {
    display: none;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--text-soft);
  }

  .usage-line strong {
    color: var(--brand-text);
    font-weight: var(--font-weight-bold);
  }

  .usage-sep {
    margin: 0 4px;
    color: var(--border);
  }

  .usage-none {
    font-style: italic;
  }

  .cell-gens {
    font-size: var(--ledger-count-size);
    font-weight: var(--font-weight-bold);
    color: var(--text-strong);
  }

  .cell-last {
    font-size: var(--ledger-meta-size);
    font-weight: var(--font-weight-medium);
    color: var(--text-soft);
  }

  .cell-none {
    font-style: italic;
    font-weight: var(--font-weight-medium);
    color: var(--text-soft);
  }

  .cell-gens.cell-none {
    font-size: var(--font-size-sm);
  }

  .wide-actions {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  /* Copy — the row's one outlined button. */
  .copy-btn {
    padding: 7px 14px;
    color: var(--brand-text);
    background: transparent;
    border: 1px solid var(--brand-text);
    border-radius: var(--radius-sm);
    font-family: inherit;
    font-size: var(--ledger-meta-size);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition:
      background var(--duration-fast) ease,
      color var(--duration-fast) ease,
      border-color var(--duration-fast) ease;
  }

  @media (hover: hover) {
    .copy-btn:hover {
      background: var(--brand-wash);
    }
  }

  .copy-btn.copied {
    color: var(--success-text);
    border-color: var(--success-text);
    background: var(--success-wash);
  }

  /* Copy link / Remove — quiet link-shaped buttons. */
  .link-action {
    padding: 0;
    color: var(--brand-text);
    background: transparent;
    border: none;
    font-family: inherit;
    font-size: var(--ledger-meta-size);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    white-space: nowrap;
  }

  @media (hover: hover) {
    .link-action:hover {
      text-decoration: underline;
    }
  }

  .link-action.copied {
    color: var(--success-text);
  }

  .link-action-danger {
    color: var(--danger-text);
  }

  .link-action:disabled {
    opacity: 0.6;
    cursor: default;
  }

  /* Compact Copy + "⋯" pair — narrow layout only. */
  .compact-actions {
    display: none;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .more-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  @media (hover: hover) {
    .more-btn:hover {
      background: var(--surface-hover);
    }
  }

  :global(.more-btn .more-icon) {
    width: 20px;
    height: 20px;
  }

  /* Re-inked via fill (not a filter chain), the modal-close-icon pattern:
     CSS fill beats the SVG's baked near-black presentation attribute. */
  :global(.more-btn .more-icon svg) {
    fill: var(--icon-muted);
  }

  /* Empty state */
  .empty {
    text-align: center;
    padding: var(--space-6) var(--space-3);
    color: var(--text-soft);
  }

  :global(.empty .empty-icon) {
    width: 40px;
    height: 40px;
    opacity: 0.4;
    margin-bottom: 10px;
  }

  .empty p {
    margin: 0;
    font-size: var(--font-size-sm);
    max-width: 320px;
    margin-inline: auto;
  }

  /* On narrow screens the column grid won't fit: the header row drops, each
     row collapses to code-over-usage beside a single Copy plus the "⋯"
     overflow menu, and the add button shortens to "Add". */
  @media (max-width: 560px) {
    .ledger-head,
    .cell-gens,
    .cell-last,
    .wide-actions,
    .add-label-full {
      display: none;
    }

    .invite {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px;
    }

    .invite-info {
      flex: 1;
    }

    .usage-line {
      display: block;
    }

    .compact-actions {
      display: inline-flex;
    }

    .add-label-short {
      display: inline;
    }

    .cta {
      padding: 13px 18px;
    }
  }
</style>
