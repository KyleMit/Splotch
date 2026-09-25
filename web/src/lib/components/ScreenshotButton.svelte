<script lang="ts">
  import Icon from './Icon.svelte';
  import { scribbleTap } from '$lib/actions/scribbleGuard';
  import { prepareCanvasExport } from '$lib/drawing/engine';
  import { canvasState } from '$lib/state/canvas.svelte';
  import { SCREENSHOT_BUTTON_ID } from '$lib/state/ui.svelte';

  // Intentionally untracked: this only memoizes the save-time chunk after the first screenshot press.
  let screenshotModulePromise: Promise<typeof import('$lib/drawing/screenshot')> | null = null;

  // The save pipeline (export compositor, polaroid, folder save) is
  // save-time-only, so it loads at press time and stays out of the startup
  // bundle (issue #461). The catch keeps a dead-connection chunk load from
  // throwing unhandled — the tap just does nothing, like the other silent
  // save degradations (see screenshot.ts).
  function loadScreenshotModule() {
    if (screenshotModulePromise) return screenshotModulePromise;
    const loading = import('$lib/drawing/screenshot').catch((error) => {
      if (screenshotModulePromise === loading) screenshotModulePromise = null;
      throw error;
    });
    screenshotModulePromise = loading;
    return loading;
  }

  function prepareScreenshotPress() {
    if (canvasState.canvasEmpty) return;
    void loadScreenshotModule()
      .then(({ prepareScreenshot }) => prepareScreenshot(prepareCanvasExport))
      .catch(() => undefined);
  }

  function cancelScreenshotPress() {
    if (!screenshotModulePromise) return;
    void loadScreenshotModule()
      .then(({ cancelScreenshotPreparation }) => cancelScreenshotPreparation())
      .catch(() => undefined);
  }

  async function handleScreenshotClick() {
    if (canvasState.canvasEmpty) return cancelScreenshotPress();
    try {
      const { saveScreenshot } = await loadScreenshotModule();
      await saveScreenshot();
    } catch (err) {
      console.error('Screenshot save failed:', err);
    }
  }

  const screenshotTap = {
    activate: handleScreenshotClick,
    onPressStart: prepareScreenshotPress,
    onPressCancel: cancelScreenshotPress,
  };
</script>

<button
  class="action-button screenshot-button"
  class:disabled={canvasState.canvasEmpty}
  id={SCREENSHOT_BUTTON_ID}
  style:--i="3"
  aria-label="Save screenshot"
  disabled={canvasState.canvasEmpty}
  use:scribbleTap={screenshotTap}
>
  <Icon name="camera" class="action-icon" />
</button>

<style>
  :global(html[data-off-screenshot] .actions-panel:not([data-action-panel-live]))
    .screenshot-button,
  :global(.actions-panel[data-action-panel-live][data-off-screenshot]) .screenshot-button {
    display: none;
  }
</style>
