<script lang="ts">
  import Icon from '../Icon.svelte';
  import { type Invite } from './AdminConsole.svelte';
  import InviteRowActions from './InviteRowActions.svelte';
  import { timeAgo, usageDetail } from '$lib/adminFormat';

  // The console's bordered "Access codes" block: an empty state, or the
  // columned table of invite rows with their Copy / Copy link / Remove
  // actions (per-row markup and styles: InviteRowActions). Copy feedback and
  // the busy guard stay with AdminConsole (the row surfaces share them); this
  // component owns the ledger shell and which row's phone-width disclosure is
  // open.
  let {
    invites,
    busy,
    copied,
    oncopy,
    onremove,
  }: {
    invites: Invite[];
    busy: boolean;
    /** The copyKey of the action showing "Copied!", or ''. */
    copied: string;
    oncopy: (key: string, text: string) => void;
    onremove: (token: string) => void;
  } = $props();

  // Phone widths collapse Copy link / Remove behind a per-row chevron that
  // expands them in place — no overlay, nothing covered (issue: the old
  // centered modal sheet dimmed the page and hid the row being acted on).
  // One row open at a time; the token identifies it.
  let expandedToken = $state<string | null>(null);

  function toggleRow(token: string) {
    expandedToken = expandedToken === token ? null : token;
  }

  // The native front door has no usage tracking (every invite's `usage` is
  // undefined there — see the Invite doc in AdminConsole), so the ledger
  // drops the Generations / Last used columns entirely rather than labelling
  // permanently blank cells.
  let showUsage = $derived(invites.some((invite) => invite.usage !== undefined));
</script>

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
      {#each invites as invite, index (invite.token)}
        <div role="row" class="invite" class:open={expandedToken === invite.token}>
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

          <InviteRowActions
            {invite}
            {busy}
            {copied}
            {oncopy}
            {onremove}
            open={expandedToken === invite.token}
            revealId={`invite-row-actions-${index}`}
            ontoggle={() => toggleRow(invite.token)}
            onclose={() => (expandedToken = null)}
          />
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
     collapses to code-over-usage beside the action set. 800px is where the
     sheet's content width (viewport minus PageShell's page padding and
     gutters, ~684px here) still clears the fixed usage/action tracks, gaps,
     and row padding (~524px) with a useful code column left over; below it
     the code track gets squeezed toward zero. The short-landscape clause
     carries that collapse through the largest supported phone without also
     treating tablet or desktop windows as a phone layout. */
  @media (max-width: 800px),
    (max-width: 956px) and (max-height: 480px) and (orientation: landscape) {
    .ledger-head,
    .cell-gens,
    .cell-last {
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
  }

  /* Narrow portraits and supported phone landscapes keep Copy plus the
     disclosure chevron; the remaining actions expand in place on a second
     line that pushes the list down (the action cells themselves:
     InviteRowActions, which carries the same media query). */
  @media (max-width: 560px),
    (max-width: 956px) and (max-height: 480px) and (orientation: landscape) {
    /* Row-gap stays 0: the collapsed reveal line is a zero-height flex item
       on its own wrap line and must not open a gap under the first line. */
    .invite {
      flex-wrap: wrap;
      gap: 0 10px;
    }

    /* The open row reads as one block against the white rows around it. */
    .invite.open {
      background: var(--surface-2);
    }
  }
</style>
