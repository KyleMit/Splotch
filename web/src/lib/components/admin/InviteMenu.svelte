<script lang="ts">
  import type { Invite } from './AdminConsole.svelte';

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

<dialog class="more-menu" bind:this={menuEl} onclick={onMenuClick} {onclose}>
  {#if invite}
    {@const inv = invite}
    <div class="more-menu-card">
      <p class="more-menu-title">{inv.token}</p>
      <button
        type="button"
        class="more-menu-item"
        onclick={() => {
          oncopy(`${inv.token}:code`, inv.token);
          closeMenu();
        }}
      >
        Copy code
      </button>
      <button
        type="button"
        class="more-menu-item"
        onclick={() => {
          oncopy(`${inv.token}:url`, inv.url);
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
  /* Modal sheet opened by the "⋯" button on narrow screens. The --admin-*
     custom properties are inherited from the .admin-page wrapper this dialog
     is mounted inside. */
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
    font-size: var(--font-size-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--admin-ink-subtle);
    border-bottom: 1px solid var(--admin-hairline);
  }

  .more-menu-item {
    display: block;
    width: 100%;
    padding: 16px 20px;
    text-align: left;
    font-family: inherit;
    font-size: var(--font-size-lg);
    font-weight: 600;
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
</style>
