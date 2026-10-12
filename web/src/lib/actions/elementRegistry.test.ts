import { describe, expect, it } from 'vitest';
import { registerElement } from './elementRegistry';

describe('registerElement', () => {
  it('hands the node to the setter on mount', () => {
    const node = document.createElement('div');
    let seen: HTMLElement | undefined;

    registerElement(node, (element) => (seen = element));

    expect(seen).toBe(node);
  });

  it('clears the setter on destroy, so a removed row leaves no stale ref', () => {
    const node = document.createElement('div');
    let seen: HTMLElement | undefined;

    const handle = registerElement(node, (element) => (seen = element));
    handle.destroy?.();

    expect(seen).toBeUndefined();
  });

  it('keys a lookup table the way the keyed-list callers do', () => {
    const table: Record<string, HTMLElement | undefined> = {};
    const nodes = ['a', 'b'].map(() => document.createElement('button'));
    const handles = nodes.map((node, index) =>
      registerElement(node, (element) => (table[`row-${index}`] = element))
    );

    expect(table).toEqual({ 'row-0': nodes[0], 'row-1': nodes[1] });

    handles[0]!.destroy?.();
    expect(table['row-0']).toBeUndefined();
    expect(table['row-1']).toBe(nodes[1]);
  });
});
