<script module lang="ts">
  // Presentational shell for the admin console at /admin (web-only,
  // server-rendered with form actions + cookie session). The page owns the auth
  // transport and data; this component owns the page chrome, forms, and the
  // interaction state shared across the row surfaces (copy feedback, the busy
  // guard) — the codes table itself is InviteLedger, including the phone-width
  // disclosure that expands a row's remaining actions in place. Callbacks
  // return whether the operation succeeded so the component knows when to
  // reset.
  // Per-token AI generation tally (mirrors $lib/server/usage TokenUsage). Kept
  // structural here so this client component never imports server code.
  // adminFormat.test.ts is the drift guard for that duplication — it reads both
  // shapes and fails to type-check if they stop agreeing.
  export interface Usage {
    count: number;
    firstUsed: string;
    lastUsed: string;
    deleteAfter: string;
    lastStyle: import('$lib/ai/styles').StyleName | null;
    lastOutcome: import('$lib/usageRecord').UsageOutcome;
  }
  export interface Invite {
    token: string;
    url: string;
    // `undefined` = usage tracking is unavailable or absent from this front
    // door; `null` = tracked but never used; an object = the tally. The
    // component renders the usage columns only when this is not `undefined`.
    usage?: Usage | null;
  }
  export interface Flash {
    kind: 'success' | 'error';
    text: string;
  }
  export type CopyTarget = 'code' | 'url';
  export const copyKey = (token: string, target: CopyTarget) => `${token}:${target}`;
  const COPY_FEEDBACK_MS = 1500;
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { FREE_GENERATION_LIMIT, type FreeGenerationGrantAdminStats } from '$lib/freeGenerations';
  import PageShell from '../page/PageShell.svelte';
  import RuleLabel from '../page/RuleLabel.svelte';
  import InviteLedger from './InviteLedger.svelte';

  let {
    authed,
    invites,
    persistent,
    freeGrantStats = null,
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
    freeGrantStats?: FreeGenerationGrantAdminStats | null;
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
      }, COPY_FEEDBACK_MS);
    } catch {
      // Clipboard may be unavailable (e.g. non-secure context); ignore.
    }
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
        — the change is either refused outright or lost on the next restart.
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

    <InviteLedger
      {invites}
      {busy}
      {copied}
      oncopy={copy}
      onremove={(token) => run(() => onremove(token))}
    />

    {#if freeGrantStats}
      <RuleLabel>Free generation grants · sample {freeGrantStats.sampledGrantCount}</RuleLabel>
      {#if !freeGrantStats.persistent}
        <div class="flash flash-warning" role="alert">
          Free grant monitoring is using local memory and will reset with this server instance.
        </div>
      {/if}
      {#if freeGrantStats.grantSamplePartial}
        <div class="flash flash-warning" role="status">
          Grant metrics and activity are sampled from the first {freeGrantStats.grantSampleLimit}
          records. Today's provider-start count is complete.
        </div>
      {/if}
      <dl class="grant-metrics">
        <div>
          <dt>Provider starts today</dt>
          <dd>{freeGrantStats.dailyProviderStarts}/{freeGrantStats.dailyProviderStartLimit}</dd>
        </div>
        <div>
          <dt>Sampled successes</dt>
          <dd>{freeGrantStats.sampledSuccessful}</dd>
        </div>
        <div>
          <dt>Sampled attempts</dt>
          <dd>{freeGrantStats.sampledAttempts}</dd>
        </div>
        <div>
          <dt>Sampled failures</dt>
          <dd>{freeGrantStats.sampledFailures}</dd>
        </div>
        <div>
          <dt>Sampled active</dt>
          <dd>{freeGrantStats.sampledActiveGrants}</dd>
        </div>
        <div>
          <dt>Sampled exhausted</dt>
          <dd>{freeGrantStats.sampledExhaustedGrants}</dd>
        </div>
        <div>
          <dt>Sampled in flight</dt>
          <dd>{freeGrantStats.sampledActiveReservations}</dd>
        </div>
      </dl>
      {#if freeGrantStats.recent.length > 0}
        <div class="grant-table-wrap">
          <table class="grant-table">
            <thead>
              <tr>
                <th>Installation</th><th>Used</th><th>Attempts</th><th>Failures</th><th
                  >Last failure</th
                >
              </tr>
            </thead>
            <tbody>
              {#each freeGrantStats.recent as grant (grant.installation)}
                <tr>
                  <td><code>{grant.installation}…</code></td>
                  <td>{grant.successful}/{FREE_GENERATION_LIMIT}</td>
                  <td>{grant.attempts}</td>
                  <td>{grant.failures}</td>
                  <td>{grant.lastFailureKind ?? '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/if}
  {/if}
</PageShell>

<style>
  .grant-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: var(--space-3);
    margin: 0 0 var(--space-5);
  }

  .grant-metrics div {
    padding: var(--space-3);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-2);
  }

  .grant-metrics dt {
    color: var(--text-soft);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
  }

  .grant-metrics dd {
    margin: var(--space-1) 0 0;
    color: var(--text-strong);
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-bold);
  }

  .grant-table-wrap {
    overflow-x: auto;
    margin-bottom: var(--space-6);
  }

  .grant-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  .grant-table th,
  .grant-table td {
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--border-width) solid var(--border);
    text-align: left;
    white-space: nowrap;
  }

  .grant-table th {
    color: var(--text-soft);
    font-weight: var(--font-weight-semibold);
  }

  .grant-table code {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
  }

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

  /* Phone: the add button shortens to "Add". */
  @media (max-width: 560px) {
    .add-label-full {
      display: none;
    }

    .add-label-short {
      display: inline;
    }

    .cta {
      padding: 13px 18px;
    }
  }
</style>
