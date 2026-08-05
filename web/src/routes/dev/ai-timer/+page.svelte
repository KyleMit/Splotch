<script lang="ts">
  import AiImageResult from '$lib/components/AiImageResult.svelte';
  import Breadcrumb from '$lib/components/Breadcrumb.svelte';
  import Button from '$lib/components/design/Button.svelte';
  import {
    aiResult,
    startAiGeneration,
    finishAiGeneration,
    failAiGeneration,
    closeAiResult,
  } from '$lib/state/aiGeneration.svelte';
  import { AI_SAFETY_REFUSAL_MESSAGE, AI_TIMEOUT_MESSAGE } from '$lib/drawing/aiImage';
  import { AI_TIMER_ARTIFACTS } from './artifactNames';

  // Sample artifacts stand in for a real generation: the child's drawing (shown
  // blurred behind the dial) and the finished "AI" image that's revealed. They
  // live under tests/ so the Playwright spec can share them, and are streamed by
  // the sibling dev-only endpoint — so this route never reaches out to Gemini.
  const drawingInputUrl = `/dev/ai-timer/artifacts/${AI_TIMER_ARTIFACTS[0]}`;
  const aiOutputUrl = `/dev/ai-timer/artifacts/${AI_TIMER_ARTIFACTS[1]}`;

  // We drive AiImageResult.svelte through the exact aiGeneration.svelte.ts seam
  // the real generate flow uses (see src/lib/drawing/aiImage.ts): open in the
  // loading state with a preview, then deliver the finished image after a delay.
  // No production code is touched — this page just calls the same public actions.

  let delayMs = $state(10000);
  let pending: ReturnType<typeof setTimeout> | null = null; // setTimeout id for the scheduled "finish"
  let runId = 0; // run id guarding stale timeouts — intentionally untracked

  function clearPending() {
    if (pending !== null) {
      clearTimeout(pending);
      pending = null;
    }
  }

  // Open the result modal in its loading state, then hand over the finished
  // image after `ms` — mirroring generateAiImage() once the API responds.
  function play(ms = delayMs) {
    clearPending();
    closeAiResult();
    runId = startAiGeneration(drawingInputUrl);
    pending = setTimeout(() => finishAiGeneration(runId, aiOutputUrl, 'image/jpeg'), ms);
  }

  // Skip the wait and reveal immediately.
  function finishNow() {
    clearPending();
    if (!aiResult.open) runId = startAiGeneration(drawingInputUrl);
    finishAiGeneration(runId, aiOutputUrl, 'image/jpeg');
  }

  // Scaffold each real failure mode so the error UI can be reviewed without a
  // Gemini call. These mirror exactly what src/lib/drawing/aiImage.ts passes to
  // failAiGeneration() for a 422 safety refusal, a timeout, and a server error.
  function fail(message: string | undefined, kind: 'safety' | 'retry' | 'generic') {
    clearPending();
    if (!aiResult.open) runId = startAiGeneration(drawingInputUrl);
    failAiGeneration(runId, message, kind);
  }
  const triggerSafety = () => fail(AI_SAFETY_REFUSAL_MESSAGE, 'safety');
  const triggerTimeout = () => fail(AI_TIMEOUT_MESSAGE, 'retry');
  const triggerServerError = () => fail(undefined, 'generic');

  function reset() {
    clearPending();
    closeAiResult();
  }

  // Once the modal opens it's a modal <dialog>, so it makes the rest of the page
  // inert and the buttons below become unclickable. Global key listeners still
  // fire, so offer hotkeys to drive the animation while it's on screen.
  const HOTKEYS: { key: string; label: string; run: () => void }[] = [
    { key: 'p', label: 'play', run: () => play() },
    { key: 'f', label: 'finish', run: finishNow },
    { key: 's', label: 'safety', run: triggerSafety },
    { key: 'e', label: 'server error', run: triggerServerError },
    { key: 't', label: 'timeout', run: triggerTimeout },
    { key: 'r', label: 'reset', run: reset },
  ];

  function onKeyDown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    const k = e.key.toLowerCase();
    HOTKEYS.find((h) => h.key === k)?.run();
  }

  // $effect cleanup instead of onDestroy: onDestroy also runs during SSR, where
  // this teardown has no business executing (.claude/rules/svelte.md).
  $effect(() => {
    return () => {
      clearPending();
      closeAiResult();
    };
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
      <Button variant="brand" size="sm" onclick={() => play(3000)}>▶ Fast (3s)</Button>
      <Button variant="brand" size="sm" onclick={() => play(10000)}>▶ Realistic (10s)</Button>
      <Button variant="brand" size="sm" onclick={() => play(15000)}>▶ Slow / overrun (15s)</Button>
    </div>

    <div class="group">
      <span class="group-label">Custom — {(delayMs / 1000).toFixed(1)}s</span>
      <input type="range" min="500" max="20000" step="500" bind:value={delayMs} />
      <Button variant="brand" size="sm" onclick={() => play()}>▶ Play</Button>
    </div>

    <div class="group">
      <span class="group-label">Jump</span>
      <Button variant="brand" size="sm" onclick={finishNow}>⏩ Finish now</Button>
      <Button variant="brand" size="sm" onclick={reset}>✕ Reset</Button>
    </div>

    <div class="group">
      <span class="group-label">Failures</span>
      <Button variant="brand" size="sm" onclick={triggerSafety}>🎨 Safety blocked (422)</Button>
      <Button variant="brand" size="sm" onclick={triggerServerError}>⚠ Server error (502)</Button>
      <Button variant="brand" size="sm" onclick={triggerTimeout}>⏱ Timeout</Button>
    </div>
  </div>

  <p class="hint">
    The modal blocks the page once open — use hotkeys to drive it from anywhere:
    {#each HOTKEYS as h, i (h.key)}<kbd>{h.key.toUpperCase()}</kbd>
      {h.label}{i < HOTKEYS.length - 1 ? ' · ' : '.'}{/each}
  </p>

  <dl class="state" aria-label="ui state">
    <div>
      <dt>open</dt>
      <dd>{aiResult.open}</dd>
    </div>
    <div>
      <dt>generating</dt>
      <dd>{aiResult.generating}</dd>
    </div>
    <div>
      <dt>error</dt>
      <dd>{aiResult.error}</dd>
    </div>
    <div>
      <dt>errorKind</dt>
      <dd>{aiResult.errorKind}</dd>
    </div>
    <div>
      <dt>hasResult</dt>
      <dd>{!!aiResult.resultUrl}</dd>
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
    color: var(--text-strong);
  }

  h1 {
    font-size: var(--font-size-xl);
    margin: 0 0 8px;
  }

  .intro {
    margin: 0 0 24px;
    color: var(--text);
    line-height: 1.5;
  }

  code {
    background: var(--brand-wash);
    border-radius: var(--radius-sm);
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
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--text-soft);
  }

  input[type='range'] {
    flex: 1;
    min-width: 160px;
    accent-color: var(--brand);
  }

  .hint {
    margin: 20px 0 0;
    font-size: var(--font-size-sm);
    color: var(--text-soft);
    line-height: 1.6;
  }

  kbd {
    /* Deliberate console-key chip: fixed dark slab + white glyph in both themes. */
    background: #2a2a2a;
    color: white;
    border-radius: var(--radius-sm);
    padding: 1px 6px;
    font-size: var(--font-size-xs);
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
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 6px 10px;
    font-size: var(--font-size-sm);
  }
  .state dt {
    font-weight: var(--font-weight-semibold);
    color: var(--text-soft);
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
    border: 1px solid var(--border);
    display: block;
  }
  .thumbs figcaption {
    margin-top: 6px;
    font-size: var(--font-size-xs);
    color: var(--text-soft);
    text-align: center;
  }
</style>
