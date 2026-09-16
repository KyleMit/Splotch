// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readonlyValue, readonlyView } from './readonlyView';

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

  it('returns an existing view without wrapping it again', () => {
    const view = readonlyValue({ nested: { count: 1 } });

    expect(readonlyValue(view)).toBe(view);
  });

  it('keeps descriptor values inside the read-only boundary', () => {
    const source = { nested: { count: 1 } };
    const view = readonlyValue(source);
    const descriptor = Object.getOwnPropertyDescriptor(view, 'nested');

    expect(() => {
      Object.assign(descriptor?.value, { count: 5 });
    }).toThrow(TypeError);
    expect(source.nested.count).toBe(1);
  });

  it('reads nested values from a frozen record without exposing them', () => {
    const nested = { count: 1 };
    const view = readonlyValue(Object.freeze({ nested }));

    expect(view.nested.count).toBe(1);
    expect(() => {
      Object.assign(view.nested, { count: 5 });
    }).toThrow(TypeError);
    expect(nested.count).toBe(1);
  });
});
