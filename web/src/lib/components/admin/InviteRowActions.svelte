<script lang="ts">
  import Icon from '../Icon.svelte';
  import { copyKey, type Invite } from './AdminConsole.svelte';

  // One ledger row's action surface, rendered as two sibling cells inside
  // InviteLedger's row: the actions cell (inline Copy / Copy link / Remove on
  // wide layouts, Copy + the disclosure chevron on phones) and the phone-width
  // reveal — the Copy link / Remove line that expands in place below the first
  // line. The ledger owns which row is open (one at a time) and the row's
  // open-state background; this component owns the action markup, styles, and
  // the height animation, and returns focus to its own chevron when Escape
  // collapses the reveal.
  let {
    invite,
    busy,
    copied,
    open,
    revealId,
    oncopy,
    onremove,
    ontoggle,
    onclose,
  }: {
    invite: Invite;
    busy: boolean;
    /** The copyKey of the action showing "Copied!", or '' (see AdminConsole). */
    copied: string;
    open: boolean;
    /** Id for the reveal cell, so the chevron's aria-controls can point at it. */
    revealId: string;
    oncopy: (key: string, text: string) => void;
    onremove: (token: string) => void;
    ontoggle: () => void;
    onclose: () => void;
  } = $props();

  // Intentionally untracked: read only imperatively, to return focus to the
  // chevron when Escape collapses the reveal from one of its buttons.
  let toggleEl: HTMLButtonElement | undefined;

  function onEscapeCollapse(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !open) return;
    toggleEl?.focus();
    onclose();
  }
</script>

{#snippet copyCodeButton()}
  <button
    type="button"
    class="copy-btn"
    class:copied={copied === copyKey(invite.token, 'code')}
    onclick={() => oncopy(copyKey(invite.token, 'code'), invite.token)}
  >
    {copied === copyKey(invite.token, 'code') ? 'Copied!' : 'Copy'}
  </button>
{/snippet}

<div role="cell" class="cell-actions">
  <div class="wide-actions">
    {@render copyCodeButton()}
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
    {@render copyCodeButton()}
    <button
      type="button"
      class="expand-btn"
      class:open
      aria-expanded={open}
      aria-controls={revealId}
      aria-label={`More options for ${invite.token}`}
      bind:this={toggleEl}
      onclick={ontoggle}
      onkeydown={onEscapeCollapse}
    >
      <Icon name="chevron-down" class="expand-icon" />
    </button>
  </div>
</div>

<!-- inert, not a visibility flip: a transitioned visibility keeps the closing
     subtree focusable in legacy-interpolation engines (WebKit at the floor,
     Firefox) for the whole close animation — a Tab right after Enter-to-close
     moved focus into "Copy link" and the transition's end then dumped it to
     <body>. inert drops the tab stops and accessibility entries the moment
     `open` flips, in every engine, while the height animation still plays;
     the collapsed line's paint is clipped by the height/overflow below. -->
<div role="cell" class="row-actions" class:open inert={!open} id={revealId}>
  <div class="row-actions-line">
    <button
      type="button"
      class="row-action"
      class:copied={copied === copyKey(invite.token, 'url')}
      aria-label={`Copy link for ${invite.token}`}
      onclick={() => oncopy(copyKey(invite.token, 'url'), invite.url)}
      onkeydown={onEscapeCollapse}
    >
      {copied === copyKey(invite.token, 'url') ? 'Copied!' : 'Copy link'}
    </button>
    <button
      type="button"
      class="row-action row-action-danger"
      disabled={busy}
      aria-label={`Remove ${invite.token}`}
      onclick={() => {
        onclose();
        onremove(invite.token);
      }}
      onkeydown={onEscapeCollapse}
    >
      Remove
    </button>
  </div>
</div>

<style>
  /* Sizing and type read the ledger's custom properties (--ledger-target-min,
     --ledger-meta-size), inherited from the ancestor .ledger block, and the
     compact media query below matches InviteLedger's compact-row query. */
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

  /* Compact Copy + chevron pair — phone layout only. */
  .compact-actions {
    display: none;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  /* The disclosure chevron: transparent at rest, so it reads as "there's more
     of this row" rather than a separate control surface. */
  .expand-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--ledger-target-min);
    height: var(--ledger-target-min);
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background var(--duration-fast) ease;
  }

  @media (hover: hover) {
    .expand-btn:hover {
      background: var(--surface-hover);
    }
  }

  /* Press and open sit below the hover block so they win on a hover-capable
     pointer too: the compact layout is reached by narrow desktop windows and
     trackpad hybrids, not only by touch, and there an earlier :active would
     lose to :hover for the whole press — leaving the button with no press
     feedback on exactly the devices this rule exists to serve. */
  .expand-btn:active,
  .expand-btn.open {
    background: var(--brand-wash);
  }

  .expand-btn:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  :global(.expand-btn .expand-icon) {
    width: 20px;
    height: 20px;
    transition: transform var(--duration-fast) var(--ease-glide);
  }

  /* One chevron glyph, rotated open — never a reactive {@html} icon swap
     (see .claude/rules/svelte.md on {@html} and hydration). */
  .expand-btn.open :global(.expand-icon) {
    transform: rotate(180deg);
  }

  /* Re-inked via fill (not a filter chain), the modal-close-icon pattern:
     CSS fill beats the SVG's baked near-black presentation attribute. */
  :global(.expand-btn .expand-icon svg) {
    fill: var(--icon-muted);
  }

  :global(.expand-btn:active .expand-icon svg),
  .expand-btn.open :global(.expand-icon svg) {
    fill: var(--brand-text);
  }

  /* The revealed Copy link / Remove line — phone layout only; the wide grid
     never renders it as a track. */
  .row-actions {
    display: none;
  }

  .row-action {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--ledger-target-min);
    padding: 7px 14px;
    color: var(--brand-text);
    background: var(--surface);
    border: var(--border-width) solid var(--border);
    border-radius: var(--radius-sm);
    font-family: inherit;
    font-size: var(--ledger-meta-size);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    white-space: nowrap;
    transition:
      background var(--duration-fast) ease,
      color var(--duration-fast) ease,
      border-color var(--duration-fast) ease;
  }

  @media (hover: hover) {
    .row-action:hover {
      background: var(--brand-wash);
    }

    .row-action-danger:hover {
      background: var(--danger-wash);
    }
  }

  .row-action.copied {
    color: var(--success-text);
    border-color: var(--success-text);
    background: var(--success-wash);
  }

  .row-action-danger {
    color: var(--danger-text);
  }

  .row-action:disabled {
    opacity: 0.6;
    cursor: default;
  }

  /* Narrow portraits and supported phone landscapes keep Copy plus the
     disclosure chevron; the remaining actions expand in place on a second
     line that pushes the list down. No overlay: nothing is covered and
     nothing needs dismissing. */
  @media (max-width: 560px),
    (max-width: 956px) and (max-height: 480px) and (orientation: landscape) {
    .wide-actions {
      display: none;
    }

    .compact-actions {
      display: inline-flex;
    }

    /* Collapsed = clipped to zero height; the markup's inert gate owns the
       tab order and accessibility tree, so no visibility flip is needed —
       and none is wanted: engines disagree on how visibility rides a
       transition (Chromium flips it discretely, WebKit/Firefox hold it for
       the duration), which is what let focus into the closing line. */
    .row-actions {
      display: block;
      flex-basis: 100%;
      height: 0;
      overflow: hidden;
      transition: height var(--duration-fast) var(--ease-glide);
    }

    /* 44px action line plus the 14px gap the first line's bottom padding
       provides in the mock; the row's own bottom padding closes the block. */
    .row-actions.open {
      height: calc(var(--ledger-target-min) + 14px);
    }

    .row-actions-line {
      display: flex;
      gap: 10px;
      padding-top: 14px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .row-actions,
    :global(.expand-btn .expand-icon) {
      transition: none;
    }
  }
</style>
