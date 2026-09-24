<script lang="ts">
  import Icon from './Icon.svelte';
  import { scribbleTap } from '$lib/actions/scribbleGuard';
  import { isAiImageButtonVisible, isAiImageButtonShown } from '$lib/actionButtonLayout';
  import { canvasState } from '$lib/state/canvas.svelte';
  import { settingsState } from '$lib/state/settings.svelte';
  import { aiPromptModal, openAiSettings } from '$lib/state/ui.svelte';
  import { buttonCenter } from '$lib/state/modal.svelte';
  import { aiGenerationState, restoreAiResult } from '$lib/state/aiGeneration.svelte';
  import { freeGenerationsState, retryOnVisibleReturn } from '$lib/state/freeGenerations.svelte';
  import { requireParentalGate } from '$lib/state/parentalGate.svelte';
  import { storeCaptureMode } from '$lib/storeCapture';
  import { unreachable } from '$lib/unreachable';

  // Intentionally untracked: the store-asset generator sets the flag before the
  // app boots and nothing changes it afterward.
  const storeCapture = storeCaptureMode();

  let aiBtnEl: HTMLButtonElement | undefined = $state();

  const aiImageButtonVisible = $derived(isAiImageButtonVisible());
  const aiImageButtonShown = $derived(isAiImageButtonShown());

  // A minimized run is the one state where a generation is in flight and this
  // button is still live: it is what reveals the run again, so it must not be
  // disabled by the same flag that stops a second one being started. An empty
  // canvas cannot block it either — the drawing was already sent.
  const aiGenerating = $derived(aiGenerationState.phase.kind === 'generating');
  const aiImageButtonBlocked = $derived(
    aiGenerationState.minimized ? false : canvasState.canvasEmpty || aiGenerating
  );

  // What a tap on the AI button does while a run waits in the corner: it shows
  // that run again, and the label says what it will find there.
  const minimizedRunLabel = $derived.by((): string | null => {
    if (!aiGenerationState.minimized) return null;
    const phase = aiGenerationState.phase;
    switch (phase.kind) {
      case 'generating':
        return 'Show the picture being made';
      case 'error':
        return "Show what didn't work";
      case 'result':
        return 'Show your finished picture';
      case 'closed':
        return null;
      default:
        return unreachable(phase);
    }
  });

  // The AI flow is a grown-ups area (it sends the drawing off-device), so the
  // tap runs through the parental gate before the prompt opens or a
  // generation starts.
  async function handleAiImageClick() {
    // A run waiting in the corner claims this tap before anything else: it is
    // the same button that started it, and ADR-0116 promises it reveals the one
    // already running. No gate — the gate was passed to start this very run, and
    // asking again to look at it would be a second toll on one action.
    if (aiGenerationState.minimized) {
      restoreAiResult();
      return;
    }
    if (aiGenerating || canvasState.canvasEmpty || !aiBtnEl) return;

    const origin = buttonCenter(aiBtnEl);
    requireParentalGate(
      'aiImage',
      () => {
        if (
          !settingsState.aiUserApiKey &&
          !settingsState.aiAccessToken &&
          (!freeGenerationsState.available || freeGenerationsState.remaining === 0)
        ) {
          openAiSettings(origin);
          return;
        }
        if (settingsState.aiCustomizationEnabled) {
          aiPromptModal.show(origin);
          return;
        }

        void import('$lib/drawing/aiImage')
          .then(({ generateAiImage }) => generateAiImage())
          .catch((error) => console.error('AI generation failed to load:', error));
      },
      origin
    );
  }
</script>

<svelte:document onvisibilitychange={retryOnVisibleReturn} />

<!-- The boot hint keeps a disabled button painted while its usable state
     settles, so the row stays stable through hydration. -->
<button
  class="action-button"
  class:disabled={aiImageButtonBlocked || !aiImageButtonVisible}
  class:loading={aiGenerating && !aiGenerationState.minimized}
  id="aiImageButton"
  style:--i="4"
  aria-label={minimizedRunLabel
    ? minimizedRunLabel
    : !aiImageButtonVisible
      ? freeGenerationsState.loading
        ? 'Checking AI image availability'
        : 'AI image unavailable'
      : settingsState.aiUserApiKey || settingsState.aiAccessToken
        ? 'Create AI image'
        : freeGenerationsState.available && freeGenerationsState.remaining > 0
          ? `Create AI image, ${freeGenerationsState.remaining} free left`
          : freeGenerationsState.available
            ? 'Set up AI image'
            : 'Create AI image'}
  aria-busy={aiGenerating && !aiGenerationState.minimized}
  disabled={aiImageButtonBlocked || !aiImageButtonVisible}
  hidden={!aiImageButtonShown}
  aria-hidden={!aiImageButtonShown || undefined}
  inert={!aiImageButtonShown}
  use:scribbleTap={handleAiImageClick}
  bind:this={aiBtnEl}
>
  <Icon
    name={aiGenerating && !aiGenerationState.minimized ? 'loading' : 'wand-stars'}
    class="action-icon"
  />
  {#if !settingsState.aiUserApiKey && !settingsState.aiAccessToken && freeGenerationsState.badgeRemaining !== null && !storeCapture}
    <span
      class="free-count"
      data-free-count={freeGenerationsState.badgeRemaining}
      aria-hidden="true"
    ></span>
  {/if}
</button>

<style>
  .free-count {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    display: grid;
    place-items: center;
    border-radius: var(--radius-pill);
    background: var(--brand-solid);
    color: var(--on-brand);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    line-height: 1;
    box-shadow: var(--shadow-control);
  }
</style>
