import { describe, expect, it } from 'vitest';
import { createModal } from './modal.svelte';

describe('modal state', () => {
  it('refuses writes through the origin getter', () => {
    const modal = createModal();
    modal.show({ x: 10, y: 20 });

    expect(() => {
      Object.assign(modal.origin!, { x: 30 });
    }).toThrow(TypeError);
    expect(modal.origin).toEqual({ x: 10, y: 20 });
  });
});
