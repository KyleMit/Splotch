<script lang="ts">
  import { onDestroy } from 'svelte';
  import AiImageResult from '$lib/components/AiImageResult.svelte';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import {
    ui,
    startAiGeneration,
    finishAiGeneration,
    failAiGeneration,
    closeAiResult,
  } from '$lib/state/ui.svelte';

  // Sample artifacts stand in for a real generation: the child's drawing (shown
  // blurred behind the dial) and the finished "AI" image that's revealed. They
  // live under tests/ so the Playwright spec can share them, and are streamed by
  // the sibling dev-only endpoint — so this route never reaches out to Gemini.
  const drawingInputUrl = '/dev/ai-timer/artifacts/drawing-input.jpeg';
  const aiOutputUrl = '/dev/ai-timer/artifacts/ai-output.jpeg';

  // We drive AiImageResult.svelte through the exact ui.svelte.js seam the real
  // generate flow uses (see src/lib/drawing/aiImage.js): open in the loading
  // state with a preview, then deliver the finished image after a delay. No
  // production code is touched — this page just calls the same public actions.

  let delayMs = $state(10000);
  let pending: ReturnType<typeof setTimeout> | 0 = 0; // setTimeout id for the scheduled "finish"

  function clearPending() {
    if (pending) {
      clearTimeout(pending);
      pending = 0;
    }
  }

  // Open the result modal in its loading state, then hand over the finished
  // image after `ms` — mirroring generateAiImage() once the API responds.
  function play(ms = delayMs) {
    clearPending();
    closeAiResult();
    startAiGeneration(drawingInputUrl);
    pending = setTimeout(() => finishAiGeneration(aiOutputUrl), ms);
  }

  // Skip the wait and reveal immediately.
  function finishNow() {
    clearPending();
    if (!ui.aiResultOpen) startAiGeneration(drawingInputUrl);
    finishAiGeneration(aiOutputUrl);
  }

  // Scaffold each real failure mode so the error UI can be reviewed without a
  // Gemini call. These mirror exactly what src/lib/drawing/aiImage.ts passes to
  // failAiGeneration() for a 422 safety refusal, a timeout, and a server error.
  function fail(message: string | undefined, kind: 'safety' | 'retry' | 'generic') {
    clearPending();
    if (!ui.aiResultOpen) startAiGeneration(drawingInputUrl);
    failAiGeneration(message, kind);
  }
  const triggerSafety = () => fail("Let's try drawing something else!", 'safety');
  const triggerTimeout = () => fail("That's taking too long — please try again.", 'retry');
  const triggerServerError = () => fail(undefined, 'generic');

  function reset() {
    clearPending();
    closeAiResult();
  }

  // Once the modal opens it's a modal <dialog>, so it makes the rest of the page
  // inert and the buttons below become unclickable. Global key listeners still
  // fire, so offer hotkeys to drive the animation while it's on screen.
  function onKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    if (k === 'p') play();
    else if (k === 'f') finishNow();
    else if (k === 's') triggerSafety();
    else if (k === 'e') triggerServerError();
    else if (k === 't') triggerTimeout();
    else if (k === 'r') reset();
  }

  onDestroy(() => {
    clearPending();
    closeAiResult();
  });
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="debug">
  <Breadcrumb current="AI Timer" />

  <h1>AI render timer — debug view</h1>
  <p class="intro">
    Drives <code>AiImageResult.svelte</code> through the real
    <code>startAiGeneration&nbsp;→&nbsp;finishAiGeneration</code> state seam using the sample artifacts
    — no Gemini call. Edit the animation in the component and replay here.
  </p>

  <div class="controls">
    <div class="group">
      <span class="group-label">Presets</span>
      <button onclick={() => play(3000)}>▶ Fast (3s)</button>
      <button onclick={() => play(10000)}>▶ Realistic (10s)</button>
      <button onclick={() => play(15000)}>▶ Slow / overrun (15s)</button>
    </div>

    <div class="group">
      <span class="group-label">Custom — {(delayMs / 1000).toFixed(1)}s</span>
      <input type="range" min="500" max="20000" step="500" bind:value={delayMs} />
      <button onclick={() => play()}>▶ Play</button>
    </div>

    <div class="group">
      <span class="group-label">Jump</span>
      <button onclick={finishNow}>⏩ Finish now</button>
      <button onclick={reset}>✕ Reset</button>
    </div>

    <div class="group">
      <span class="group-label">Failures</span>
      <button onclick={triggerSafety}>🎨 Safety blocked (422)</button>
      <button onclick={triggerServerError}>⚠ Server error (502)</button>
      <button onclick={triggerTimeout}>⏱ Timeout</button>
    </div>
  </div>

  <p class="hint">
    The modal blocks the page once open — use hotkeys to drive it from anywhere:
    <kbd>P</kbd> play · <kbd>F</kbd> finish · <kbd>S</kbd> safety · <kbd>E</kbd> server error ·
    <kbd>T</kbd>
    timeout · <kbd>R</kbd> reset.
  </p>

  <dl class="state" aria-label="ui state">
    <div>
      <dt>aiResultOpen</dt>
      <dd>{ui.aiResultOpen}</dd>
    </div>
    <div>
      <dt>aiGenerating</dt>
      <dd>{ui.aiGenerating}</dd>
    </div>
    <div>
      <dt>aiError</dt>
      <dd>{ui.aiError}</dd>
    </div>
    <div>
      <dt>aiErrorKind</dt>
      <dd>{ui.aiErrorKind}</dd>
    </div>
    <div>
      <dt>hasResult</dt>
      <dd>{!!ui.aiResultUrl}</dd>
    </div>
  </dl>

  <div class="thumbs">
    <figure>
      <img src={drawingInputUrl} alt="drawing input artifact" />
      <figcaption>drawing-input → blurred preview</figcaption>
    </figure>
    <figure>
      <img src={aiOutputUrl} alt="ai output artifact" />
      <figcaption>ai-output → revealed result</figcaption>
    </figure>
  </div>
</div>

<!-- The real component under test. -->
<AiImageResult />

<style>
  .debug {
    max-width: 720px;
    margin: 0 auto;
    padding: 32px 24px 64px;
    font-family: system-ui, sans-serif;
    color: #2a2a2a;
  }

  h1 {
    font-size: 22px;
    margin: 0 0 8px;
  }

  .intro {
    margin: 0 0 24px;
    color: #555;
    line-height: 1.5;
  }

  code {
    background: #f0ecf7;
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 0.9em;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .group {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .group-label {
    width: 130px;
    font-size: 13px;
    font-weight: 600;
    color: #777;
  }

  button {
    background: var(--brand);
    color: white;
    border: none;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background 0.15s ease,
      transform 0.1s ease;
  }
  /* Guard hover behind a real pointer: touch browsers apply :hover on tap and
     keep it stuck until the next tap elsewhere. */
  @media (hover: hover) {
    button:hover {
      background: #9559cd;
    }
  }
  button:active {
    transform: scale(0.96);
  }

  input[type='range'] {
    flex: 1;
    min-width: 160px;
    accent-color: var(--brand);
  }

  .hint {
    margin: 20px 0 0;
    font-size: 13px;
    color: #777;
    line-height: 1.6;
  }

  kbd {
    background: #2a2a2a;
    color: white;
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 12px;
    font-family: ui-monospace, monospace;
  }

  .state {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 20px 0 0;
    padding: 0;
  }
  .state > div {
    display: flex;
    gap: 6px;
    background: #f7f5fb;
    border: 1px solid #e6e0f0;
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 13px;
  }
  .state dt {
    font-weight: 600;
    color: #777;
    margin: 0;
  }
  .state dd {
    margin: 0;
    font-family: ui-monospace, monospace;
    color: var(--brand);
  }

  .thumbs {
    display: flex;
    gap: 16px;
    margin: 28px 0 0;
  }
  .thumbs figure {
    margin: 0;
    flex: 1;
  }
  .thumbs img {
    width: 100%;
    border-radius: 10px;
    border: 1px solid #e6e0f0;
    display: block;
  }
  .thumbs figcaption {
    margin-top: 6px;
    font-size: 12px;
    color: #777;
    text-align: center;
  }
</style>
