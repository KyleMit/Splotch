// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readonlyView } from './readonlyView';

describe('readonlyView', () => {
  it('reads the source live rather than copying it', () => {
    const source = { count: 1 };
    const view = readonlyView(source);

    source.count = 2;

    expect(view.count).toBe(2);
  });

  it('enumerates the same keys as the source', () => {
    const view = readonlyView({ a: 1, b: 'two' });

    expect(Object.keys(view)).toEqual(['a', 'b']);
    expect({ ...view }).toEqual({ a: 1, b: 'two' });
  });

  it('throws on a write instead of silently dropping it', () => {
    const source = { count: 1 };
    const view = readonlyView(source);

    expect(() => {
      Object.assign(view, { count: 5 });
    }).toThrow(TypeError);
    expect(source.count).toBe(1);
  });

  it('keeps nested objects live while refusing writes through the view', () => {
    const source = { nested: { count: 1 }, items: [{ id: 'one' }] };
    const view = readonlyView(source);

    expect(() => {
      Object.assign(view.nested, { count: 5 });
    }).toThrow(TypeError);
    expect(() => {
      Object.assign(view.items[0], { id: 'two' });
    }).toThrow(TypeError);

    source.nested.count = 2;
    expect(view.nested.count).toBe(2);
    expect(view.nested).toBe(view.nested);
  });
});
