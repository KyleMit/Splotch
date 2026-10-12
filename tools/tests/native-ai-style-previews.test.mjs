// @vitest-environment happy-dom
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { files } from './native-drawing-screen-harness.mjs';
import { AI_STYLES } from '../../experiments/native-architecture/src/ai/contract.ts';
import { NativeAiStyleChoices } from '../../experiments/native-architecture/src/ai/NativeAiStyleChoices.tsx';
import { DrawingAppearanceProvider } from '../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';

let container;
let root;
let choose;
const REPOSITORY = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function render(selected = 'Clay', disabled = false, theme = 'light') {
  return act(() =>
    root.render(
      createElement(
        DrawingAppearanceProvider,
        { preference: theme },
        createElement(NativeAiStyleChoices, { selected, disabled, onChoose: choose })
      )
    )
  );
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  choose = vi.fn();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

it.each(AI_STYLES)('bundles byte-identical light and dark first-party %s covers', async (style) => {
  for (const theme of ['light', 'dark']) {
    const filename = `${style.toLowerCase()}.${theme}.webp`;
    const bundled = await readFile(
      resolve(REPOSITORY, 'experiments/native-architecture/assets/ai-styles', filename)
    );
    const original = await readFile(resolve(REPOSITORY, 'web/static/styles', filename));
    expect(bundled.equals(original)).toBe(true);
  }
});

it('shows named visual radios, chooses a literal style, and follows live appearance', async () => {
  await render();
  const radios = [...container.querySelectorAll('[role="radio"]')];
  expect(radios.map((radio) => radio.getAttribute('aria-label'))).toEqual(
    AI_STYLES.map((style) => `${style} AI style`)
  );
  expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(
    AI_STYLES.map((style) => String(style === 'Clay'))
  );
  expect(radios.map((radio) => radio.querySelector('img').getAttribute('src'))).toEqual(
    expect.arrayContaining(
      AI_STYLES.map((style) =>
        expect.stringContaining(`/ai-styles/${style.toLowerCase()}.light.webp`)
      )
    )
  );
  await act(async () => container.querySelector('[aria-label="Paper AI style"]').click());
  expect(choose).toHaveBeenCalledExactlyOnceWith('Paper');
  await render('Paper', false, 'dark');
  expect(
    container.querySelector('[aria-label="Paper AI style"]').getAttribute('aria-checked')
  ).toBe('true');
  for (const style of AI_STYLES) {
    expect(
      container.querySelector(`[aria-label="${style} AI style"] img`).getAttribute('src')
    ).toContain(`/ai-styles/${style.toLowerCase()}.dark.webp`);
  }
  expect(files.aiSend).not.toHaveBeenCalled();
  expect(files.aiVaultRead).not.toHaveBeenCalled();
});

it('keeps every visual radio disabled and preserves the selection while blocked', async () => {
  await render('Crayon', true);
  const radios = [...container.querySelectorAll('[role="radio"]')];
  expect(radios.every((radio) => radio.disabled)).toBe(true);
  await act(async () => container.querySelector('[aria-label="Clay AI style"]').click());
  expect(choose).not.toHaveBeenCalled();
  expect(
    container.querySelector('[aria-label="Crayon AI style"]').getAttribute('aria-checked')
  ).toBe('true');
});
