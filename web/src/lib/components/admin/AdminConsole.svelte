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
    // `null` = tracked but never used; an object = the tally. Whether tracking
    // works at all is a separate `usageAvailable` flag, because a broken tally
    // backend and a code nobody has redeemed produce the same empty cell.
    usage: Usage | null;
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
  import { createHydratedFlag } from '$lib/hydration.svelte';
  import { FREE_GENERATION_LIMIT, type FreeGenerationGrantAdminStats } from '$lib/freeGenerations';
  import PageShell from '../page/PageShell.svelte';
  import Button from '../design/Button.svelte';
  import RuleLabel from '../design/RuleLabel.svelte';
  import StatusMessage from '../design/StatusMessage.svelte';
  import InviteLedger from './InviteLedger.svelte';

  let {
    authed,
    invites,
    persistent,
    usageAvailable = true,
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
    // `false` = the generation tally is unreachable (its store threw, or the
    // signing secret is unset), so the usage columns carry no data to show.
    usageAvailable?: boolean;
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
  const hydration = createHydratedFlag();

  let submitDisabled = $derived(busy || !hydration.hydrated);

  // The gate flips `disabled` off on mount, and the Button primitive would
  // fade its parked fill to the brand one over --duration-base — a grey-to-
  // purple fade on every load, and a mid-fade the axe scan can sample. The
  // flip stays instant by holding the primitive's transition off until the
  // frame after the buttons went live.
  let hydrationSettled = $state(false);
  $effect(() => {
    if (!hydration.hydrated) return;
    const frame = requestAnimationFrame(() => {
      hydrationSettled = true;
    });
    return () => cancelAnimationFrame(frame);
  });
  let submitClass = $derived(hydrationSettled ? '' : 'hydrating');

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
  // One timer for the one cell that can be showing "Copied!": a repeat copy
  // restarts the window instead of leaving the earlier timer to end it early.
  // Plain `let`s — a timer handle and a session counter are bookkeeping, not
  // state the template reads.
  let copyFeedbackTimer: ReturnType<typeof setTimeout> | undefined;
  // Bumped on sign-out so a clipboard write still pending from the signed-out
  // session cannot re-arm the feedback after the next sign-in.
  let copySession = 0;

  async function copy(key: string, text: string) {
    const session = copySession;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard may be unavailable (e.g. non-secure context); ignore.
      return;
    }
    if (session !== copySession) return;
    clearTimeout(copyFeedbackTimer);
    copied = key;
    copyFeedbackTimer = setTimeout(() => {
      copied = '';
    }, COPY_FEEDBACK_MS);
  }

  function endCopyFeedback() {
    copySession += 1;
    clearTimeout(copyFeedbackTimer);
    copied = '';
  }

  // A half-typed code is one admin session's draft, not the next one's: the
  // component stays mounted across sign-out, so the draft and the copy
  // feedback are cleared here once the session has actually ended (a failed
  // logout leaves them alone).
  function handleLogout() {
    run(async () => {
      await onlogout();
      newToken = '';
      endCopyFeedback();
    });
  }
</script>

<PageShell title="Admin" wordmark="Splotch Admin">
  {#snippet lede()}
    Manage AI access codes
  {/snippet}

  {#snippet actions()}
    {#if authed}
      <Button variant="wash" size="md" disabled={busy} onclick={handleLogout}>Sign out</Button>
    {/if}
  {/snippet}

  {#if !authed}
    <section class="block">
      <RuleLabel>Sign in</RuleLabel>
      {#if shownLoginError}
        <StatusMessage status="error">{shownLoginError}</StatusMessage>
      {/if}
      <form onsubmit={handleLogin} class="add-form sign-in-form">
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
        <Button
          variant="brand"
          size="lg"
          type="submit"
          class={submitClass}
          disabled={submitDisabled}>Sign in</Button
        >
      </form>
    </section>
  {:else}
    <div class="admin-sections">
      <section class="block">
        <RuleLabel count={invites.length}>Access codes</RuleLabel>
        {#if !persistent}
          <StatusMessage status="warning">
            <strong>Netlify Blobs is unavailable.</strong> You're viewing a local-only copy seeded
            from the <code>ALLOWED_TOKENS_LIST</code> env var. Any codes you add or remove here won't
            be saved — the change is either refused outright or lost on the next restart.
          </StatusMessage>
        {/if}

        {#if !usageAvailable}
          <StatusMessage status="warning">
            <strong>Generation tallies are unavailable.</strong> The Generations and Last used columns
            are hidden until the usage store is reachable again. The codes themselves are unaffected.
          </StatusMessage>
        {/if}

        {#if shownFlash}
          <StatusMessage status={shownFlash.kind}>{shownFlash.text}</StatusMessage>
        {/if}

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
          <Button
            variant="brand"
            size="lg"
            type="submit"
            class={submitClass}
            disabled={submitDisabled}
            aria-label="Add code"
          >
            <span class="add-label-full">Add code</span><span class="add-label-short">Add</span>
          </Button>
        </form>

        <InviteLedger
          {invites}
          {usageAvailable}
          {busy}
          {copied}
          oncopy={copy}
          onremove={(token) => run(() => onremove(token))}
        />
      </section>
      {#if freeGrantStats}
        <section class="block">
          <RuleLabel count={`sample ${freeGrantStats.sampledGrantCount}`}
            >Free generation grants</RuleLabel
          >
          {#if !freeGrantStats.persistent}
            <StatusMessage status="warning">
              Free grant monitoring is using local memory and will reset with this server instance.
            </StatusMessage>
          {/if}
          {#if freeGrantStats.grantSamplePartial}
            <StatusMessage status="warning">
              Grant metrics and activity are sampled from the first {freeGrantStats.grantSampleLimit}
              records. Today's provider-start count is complete.
            </StatusMessage>
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
        </section>
      {/if}
    </div>
  {/if}
</PageShell>

<style>
  .admin-sections {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .block :global(.status-message) {
    margin: 0;
  }

  .grant-metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: var(--space-3);
    margin: 0;
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

  /* Add form (shared by the sign-in form and the add bar) */
  .add-form {
    display: flex;
    gap: 10px;
  }

  .sign-in-form {
    max-width: 480px;
    margin: 0 auto;
    width: 100%;
  }

  .add-form input {
    flex: 1;
    min-width: 0;
    max-width: 420px;
    padding: 13px 16px;
    font-size: var(--input-font-size);
    font-family: inherit;
    border: var(--border-width) solid var(--border-warm-strong);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--text-strong);
    transition: border-color var(--duration-fast) var(--ease-glide);
  }

  .add-form input:focus {
    border-color: var(--brand-solid);
  }
  /* The forms' solid call to action is the Button primitive; the row only
     keeps it from shrinking beside the input. */
  .add-form :global(.btn) {
    flex-shrink: 0;
    white-space: nowrap;
  }

  .add-form :global(.btn.hydrating) {
    transition: none;
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
  }
</style>
