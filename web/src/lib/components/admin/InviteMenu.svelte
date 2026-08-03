<script lang="ts">
  import { copyKey, type Invite } from './AdminConsole.svelte';

  // The narrow layout collapses the per-row actions into a single "Copy" plus a
  // "⋯" button that opens this modal sheet — the same Copy code / Copy link /
  // Remove actions, just one tap deeper. `invite` is the row it belongs to.
  let {
    invite,
    busy,
    oncopy,
    onremove,
    onclose,
  }: {
    invite: Invite | null;
    busy: boolean;
    oncopy: (key: string, text: string) => void;
    onremove: (token: string) => void;
    onclose: () => void;
  } = $props();

  let menuEl = $state<HTMLDialogElement>();

  export function open() {
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

<dialog class="more-menu modal-dialog modal-shell" bind:this={menuEl} onclick={onMenuClick} {onclose}>
  {#if invite}
    {@const inv = invite}
    <div class="more-menu-card">
      <p class="more-menu-title">{inv.token}</p>
      <button
        type="button"
        class="more-menu-item"
        onclick={() => {
          oncopy(copyKey(inv.token, 'code'), inv.token);
          closeMenu();
        }}
      >
        Copy code
      </button>
      <button
        type="button"
        class="more-menu-item"
        onclick={() => {
          oncopy(copyKey(inv.token, 'url'), inv.url);
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
          onremove(inv.token);
        }}
      >
        Remove
      </button>
    </div>
  {/if}
</dialog>

<style>
  /* Modal sheet opened by the "⋯" button on narrow screens. The shared
     .modal-dialog / .modal-shell classes (app.css) carry the backdrop,
     centering, radius, and shadow; only the width and the pinned light
     surface stay here — .modal-shell's var(--surface) is themed and would
     flip this light-only sheet dark. The --admin-* custom properties are
     inherited from the .admin-page wrapper this dialog is mounted inside. */
  .more-menu {
    width: min(340px, calc(100vw - 48px));
    background: var(--admin-sheet);
  }

  .more-menu-title {
    margin: 0;
    padding: 16px 20px 12px;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--admin-ink-muted);
    border-bottom: 1px solid var(--admin-hairline);
  }

  .more-menu-item {
    display: block;
    width: 100%;
    padding: 16px 20px;
    text-align: left;
    font-family: inherit;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--admin-accent);
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--admin-hairline);
    cursor: pointer;
  }

  .more-menu-item:last-child {
    border-bottom: none;
  }

  @media (hover: hover) {
    .more-menu-item:hover {
      background: var(--admin-accent-tint);
    }
  }

  .more-menu-item-danger {
    color: var(--admin-danger-ink);
  }

  @media (hover: hover) {
    .more-menu-item-danger:hover {
      background: var(--admin-danger-wash);
    }
  }

  .more-menu-item:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
