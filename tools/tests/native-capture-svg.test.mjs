// @vitest-environment happy-dom
import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import Svg from 'react-native-svg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureSvg } from '../../experiments/native-architecture/src/drawing/CaptureSvg.web.tsx';
import { CaptureSvg as NativeCaptureSvg } from '../../experiments/native-architecture/src/drawing/CaptureSvg.tsx';
import { patchSnapshotMethod } from '../migration/probes/native-eraser/checkpoint-observation.mjs';

vi.mock('react-native-svg', async () => {
  const { Component, createElement, createRef } = await import('react');
  return {
    default: class Svg extends Component {
      elementRef = createRef();
      render() {
        return createElement(
          'svg',
          {
            ref: this.elementRef,
            width: this.props.width,
            height: this.props.height,
            viewBox: this.props.viewBox,
          },
          this.props.children
        );
      }
    },
  };
});

const DIMENSIONS = { width: 1024, height: 768 };
const PNG = 'data:image/png;base64,aW5r';
let host, root, ref, images, canvases, draw;
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  images = [];
  canvases = [];
  draw = vi.fn();
  vi.stubGlobal('Image', function () {
    const attributes = new Map();
    const image = {
      onload: null,
      onerror: null,
      get src() {
        return attributes.get('src') ?? '';
      },
      set src(value) {
        attributes.set('src', value);
      },
      getAttribute: (name) => attributes.get(name) ?? null,
      removeAttribute: (name) => attributes.delete(name),
    };
    images.push(image);
    return image;
  });
  vi.spyOn(SVGSVGElement.prototype, 'getBoundingClientRect').mockReturnValue(DIMENSIONS);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
    canvases.push(this);
    return { drawImage: draw };
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(PNG);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  ref = createRef();
  await act(async () =>
    root.render(
      createElement(
        CaptureSvg,
        {
          ref,
          ...DIMENSIONS,
          viewBox: '0 0 1024 768',
        },
        createElement('path', { d: 'M1 2L3 4', stroke: '#123456' })
      )
    )
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function capture() {
  const callback = vi.fn();
  const release = ref.current.toDataURL(callback, DIMENSIONS);
  return { callback, release, image: images.at(-1), loaded: images.at(-1).onload };
}
function released(image) {
  expect(image.onload).toBeNull();
  expect(image.onerror).toBeNull();
  expect(image.getAttribute('src')).toBeNull();
}

describe('owned web fixed-grid SVG snapshot lifecycle', () => {
  it('keeps the native facade equal to the qualified Svg with no invented cancellation', () => {
    expect(NativeCaptureSvg).toBe(Svg);
  });

  it('serializes the actual fixed source and disposes resources before accepting its PNG', () => {
    const serialized = vi.spyOn(XMLSerializer.prototype, 'serializeToString');
    const { callback, release, image, loaded } = capture();
    const source = serialized.mock.results[0].value;
    expect(decodeURIComponent(image.src.split(',').slice(1).join(','))).toBe(source);
    expect(source).toContain('viewBox="0 0 1024 768"');
    expect(source).toContain('M1 2L3 4');
    const detached = serialized.mock.calls[0][0];
    expect(detached.children).toHaveLength(0);
    loaded();
    expect(draw).toHaveBeenCalledWith(image, 0, 0);
    expect(callback).toHaveBeenCalledExactlyOnceWith('aW5r');
    released(image);
    expect(canvases[0].width).toBe(0);
    expect(canvases[0].height).toBe(0);
    release();
    loaded();
    expect(callback).toHaveBeenCalledOnce();
  });

  it('observes the actual mounted own method while preserving its DOM target and disposal return', () => {
    const calls = [],
      state = { patched: new WeakSet() };
    patchSnapshotMethod(
      state,
      ref.current,
      (original) =>
        function (callback, options) {
          calls.push({ target: this.elementRef.current, options });
          return original.call(this, callback, options);
        }
    );
    const { callback, release, loaded } = capture();
    expect(calls).toEqual([{ target: host.querySelector('svg'), options: DIMENSIONS }]);
    loaded();
    expect(callback).toHaveBeenCalledExactlyOnceWith('aW5r');
    release();
    expect(callback).toHaveBeenCalledOnce();
  });

  it('cancels the owned raster and refuses its late load without allocating a canvas', () => {
    const { callback, release, image, loaded } = capture();
    release();
    released(image);
    loaded();
    expect(draw).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
    expect(canvases).toHaveLength(0);
  });

  it('releases only the superseded raster and accepts the current snapshot once', () => {
    const first = capture();
    const second = capture();
    released(first.image);
    first.loaded();
    expect(first.callback).not.toHaveBeenCalled();
    second.loaded();
    expect(second.callback).toHaveBeenCalledExactlyOnceWith('aW5r');
    first.release();
    released(second.image);
    expect(second.callback).toHaveBeenCalledOnce();
  });

  it('fails closed on image decode error and ignores duplicate load/error callbacks', () => {
    const { callback, image, loaded } = capture();
    const failed = image.onerror;
    failed();
    expect(callback).toHaveBeenCalledExactlyOnceWith('');
    released(image);
    failed();
    loaded();
    expect(callback).toHaveBeenCalledOnce();
    expect(draw).not.toHaveBeenCalled();
  });

  it('releases the actual mounted owner on unmount and rejects its held load', () => {
    const { callback, image, loaded } = capture();
    act(() => root.unmount());
    root = createRoot(host);
    released(image);
    loaded();
    expect(callback).not.toHaveBeenCalled();
    expect(draw).not.toHaveBeenCalled();
  });

  it('refuses wrong fixed geometry before starting a raster job', () => {
    vi.mocked(SVGSVGElement.prototype.getBoundingClientRect).mockReturnValue({
      width: 1022,
      height: 766,
    });
    expect(() => ref.current.toDataURL(vi.fn(), DIMENSIONS)).toThrow('not ready');
    expect(images).toHaveLength(0);
  });

  it('refuses missing or mismatched target/options instead of capturing another surface', () => {
    expect(() => ref.current.toDataURL(vi.fn(), { width: 1, height: 1 })).toThrow('dimensions');
    ref.current.elementRef = { current: document.createElement('div') };
    expect(() => ref.current.toDataURL(vi.fn(), DIMENSIONS)).toThrow('unavailable');
    expect(images).toHaveLength(0);
  });

  it('disposes the canvas and refuses a failed draw without claiming a PNG', () => {
    draw.mockImplementation(() => {
      throw new Error('Lost raster context');
    });
    const { callback, image, loaded } = capture();
    loaded();
    expect(callback).toHaveBeenCalledExactlyOnceWith('');
    released(image);
    expect(canvases[0].width).toBe(0);
    expect(canvases[0].height).toBe(0);
  });
});
