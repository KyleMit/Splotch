<script lang="ts">
  import Icon from '../Icon.svelte';
  import { copyKey, type Invite } from './AdminConsole.svelte';
  import { timeAgo, usageDetail } from '$lib/adminFormat';

  // The console's bordered "Access codes" block: an empty state, or the
  // columned table of invite rows with their Copy / Copy link / Remove
  // actions. Copy feedback and the busy guard stay with AdminConsole (the
  // overflow menu shares them); this component owns only the ledger's markup
  // and styles.
  let {
    invites,
    busy,
    copied,
    oncopy,
    onremove,
    onmore,
  }: {
    invites: Invite[];
    busy: boolean;
    /** The copyKey of the action showing "Copied!", or ''. */
    copied: string;
    oncopy: (key: string, text: string) => void;
    onremove: (token: string) => void;
    onmore: (invite: Invite) => void;
  } = $props();

  // The native front door has no usage tracking (every invite's `usage` is
  // undefined there — see the Invite doc in AdminConsole), so the ledger
  // drops the Generations / Last used columns entirely rather than labelling
  // permanently blank cells.
  let showUsage = $derived(invites.some((invite) => invite.usage !== undefined));
</script>

{#snippet copyCodeButton(invite: Invite)}
  <button
    type="button"
    class="copy-btn"
    class:copied={copied === copyKey(invite.token, 'code')}
    onclick={() => oncopy(copyKey(invite.token, 'code'), invite.token)}
  >
    {copied === copyKey(invite.token, 'code') ? 'Copied!' : 'Copy'}
  </button>
{/snippet}

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
  <div class="ledger" class:no-usage={!showUsage} role="table" aria-label="Access codes">
    <div role="rowgroup" class="ledger-head">
      <div role="row" class="ledger-head-row">
        <span role="columnheader">Code</span>
        {#if showUsage}
          <span role="columnheader">Generations</span>
          <span role="columnheader">Last used</span>
        {/if}
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

          {#if showUsage}
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
          {/if}

          <div role="cell" class="cell-actions">
            <div class="wide-actions">
              {@render copyCodeButton(invite)}
              <button
                type="button"
                class="link-action"
                class:copied={copied === copyKey(invite.token, 'url')}
                onclick={() => oncopy(copyKey(invite.token, 'url'), invite.url)}
              >
                {copied === copyKey(invite.token, 'url') ? 'Copied!' : 'Copy link'}
              </button>
              <button
                type="button"
                class="link-action link-action-danger"
                disabled={busy}
                aria-label={`Remove ${invite.token}`}
                onclick={() => onremove(invite.token)}
              >
                Remove
              </button>
            </div>

            <div class="compact-actions">
              {@render copyCodeButton(invite)}
              <button
                type="button"
                class="more-btn"
                aria-label={`More options for ${invite.token}`}
                onclick={() => onmore(invite)}
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

<style>
  /* The ledger — one bordered block of columned rows. Its type runs a step
     finer than the app ramp (11/13/15px sit between the xs and sm steps) so
     four columns fit the sheet; sizes from the approved redesign. */
  .ledger {
    --ledger-columns: 1fr 100px 120px 240px;
    --ledger-label-size: 11px;
    --ledger-meta-size: 13px;
    --ledger-count-size: 15px;
    /* The design system's interaction-target floor: every row action meets
       44px even where its visual treatment is a slim link or outline chip. */
    --ledger-target-min: 44px;

    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  /* Without usage tracking (the native front door) the grid is just
     Code / Actions. */
  .ledger.no-usage {
    --ledger-columns: 1fr 240px;
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

  /* 6px block padding, not the mock's 12px: the 44px action targets already
     carry the row to the mock's ~56px height. */
  .invite {
    display: grid;
    grid-template-columns: var(--ledger-columns);
    gap: var(--space-2);
    align-items: center;
    padding: 6px 20px;
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--ledger-target-min);
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

  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it stuck until the next tap elsewhere. */
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

  /* Copy link / Remove — quiet link-shaped buttons. The box is invisible, so
     the 44px floor costs nothing visually. */
  .link-action {
    display: inline-flex;
    align-items: center;
    min-height: var(--ledger-target-min);
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
    width: var(--ledger-target-min);
    height: var(--ledger-target-min);
    padding: 0;
    background: var(--surface-2);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--duration-fast) ease;
  }

  @media (hover: hover) {
    .more-btn:hover {
      background: var(--surface-hover);
    }
  }

  /* Press sits below the hover block so it wins on a hover-capable pointer too:
     the compact layout is reached by narrow desktop windows and trackpad
     hybrids, not only by touch, and there an earlier :active would lose to
     :hover for the whole press — leaving the button with no press feedback on
     exactly the devices this rule exists to serve. */
  .more-btn:active {
    background: var(--brand-wash);
  }

  .more-btn:focus-visible {
    outline: 2px solid var(--brand-solid);
    outline-offset: 2px;
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

  :global(.more-btn:active .more-icon svg) {
    fill: var(--brand-text);
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

  /* Where the column grid stops fitting, the header row drops and each row
     collapses to code-over-usage beside a single Copy plus the "⋯" overflow
     menu. 800px is where the sheet's content width (viewport minus PageShell's
     page padding and gutters, ~684px here) still clears the fixed usage/action
     tracks, gaps, and row padding (~524px) with a useful code column left over;
     below it the code track gets squeezed toward zero. */
  @media (max-width: 800px) {
    .ledger-head,
    .cell-gens,
    .cell-last,
    .wide-actions {
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
  }
</style>
