<script lang="ts">
  // Friendly, dependency-light crash fallback. Kept free of icon/state imports
  // so it can render even when the rest of the app failed to. Shared by the
  // SvelteKit error page (+error.svelte) and the layout's render boundary.
  interface Props {
    onRestart?: () => void;
  }
  let { onRestart = () => location.assign('/') }: Props = $props();
</script>

<div class="error-screen" role="alert">
  <div class="error-blob" aria-hidden="true"></div>
  <h1>Oops!</h1>
  <p>Something went wrong. Let's start a fresh drawing.</p>
  <button type="button" class="error-restart" onclick={onRestart}>Start over</button>
</div>

<style>
  .error-screen {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 24px;
    text-align: center;
    background: var(--app-bg, #fcfbf8);
    color: var(--text-strong, #333);
    font-family: var(--font-family, 'Quicksand Variable', system-ui, sans-serif);
  }

  .error-blob {
    /* standalone crash screen, no sizing token exists for this yet */
    width: 96px;
    height: 96px;
    background: var(--brand, #ab71e1);
    border-radius: 42% 58% 63% 37% / 47% 42% 58% 53%;
    opacity: 0.9;
  }

  h1 {
    margin: 0;
    /* fallback is a fixed 32px near the token's fluid floor: the crash path
       must render a sane size even if tokens.css fails to load */
    font-size: var(--font-size-display, 32px);
    font-weight: var(--font-weight-bold);
  }

  p {
    margin: 0;
    font-size: var(--font-size-md);
    color: var(--text-soft, #666);
    max-width: 320px;
  }

  .error-restart {
    margin-top: 8px;
    padding: 14px 32px;
    border: none;
    border-radius: var(--radius-pill);
    /* --brand-solid, not --brand: an 18px bold label sits below WCAG's
       large-text threshold, and --brand is only 3.4:1 under white. */
    background: var(--brand-solid, #7c50bb);
    color: var(--on-brand, #fff);
    font: inherit;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    cursor: pointer;
  }

  .error-restart:active {
    transform: scale(0.97);
  }
</style>
