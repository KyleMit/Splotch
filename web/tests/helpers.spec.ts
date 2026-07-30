import { expect, test, type Page } from '@playwright/test';

import { dragStroke } from './helpers';

test('dragStroke rejects empty strokes before mouse input', async () => {
  let mouseCalls = 0;
  const page = {
    mouse: {
      move: async () => {
        mouseCalls += 1;
      },
      down: async () => {
        mouseCalls += 1;
      },
      up: async () => {
        mouseCalls += 1;
      },
    },
  } as unknown as Page;

  await expect(dragStroke(page, { x: 0, y: 0, width: 100, height: 100 }, [])).rejects.toThrow(
    'cannot draw a stroke without points'
  );
  expect(mouseCalls).toBe(0);
});
