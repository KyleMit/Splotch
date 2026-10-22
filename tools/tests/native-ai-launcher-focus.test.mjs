// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { returnFocusToAiLauncher } from '../../src/platform/aiLauncherFocus.web.ts';
import { drawerToolId } from '../../src/rsdDrawing/drawerToolId.ts';

// Shipping's returnFocusToLauncher (AiImageResult.svelte), as RN web runs it once the AI result
// card has left the page (#3018).
function page({ aiTool = true } = {}) {
  document.body.innerHTML = `${
    aiTool ? `<div id="${drawerToolId('ai')}"><button>Create AI image</button></div>` : ''
  }<div data-testid="rsd-drawer-dock"><button>Expand controls</button></div><input id="elsewhere">`;
}

beforeEach(() => vi.stubGlobal('requestAnimationFrame', (run) => run()));
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

it('lands focus on the AI button with the drawer open', () => {
  page();
  returnFocusToAiLauncher();
  expect(document.activeElement?.textContent).toBe('Create AI image');
});

it('lands focus on the drawer toggle while the drawer hides the AI button', () => {
  page({ aiTool: false });
  returnFocusToAiLauncher();
  expect(document.activeElement?.textContent).toBe('Expand controls');
});

it('leaves focus that something else holds where it is', () => {
  page();
  document.getElementById('elsewhere').focus();
  returnFocusToAiLauncher();
  expect(document.activeElement?.id).toBe('elsewhere');
});
