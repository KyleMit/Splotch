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

  it('captures a translated fractional projection on its integer raster', async () => {
    const viewBox = '-0.25 -0.125 1023.75 768.25';
    await act(async () => root.render(createElement(CaptureSvg, { ref, ...DIMENSIONS, viewBox })));
    const serialized = vi.spyOn(XMLSerializer.prototype, 'serializeToString');
    const { callback, loaded } = capture();
    expect(serialized.mock.results[0].value).toContain(`viewBox="${viewBox}"`);
    loaded();
    expect(callback).toHaveBeenCalledExactlyOnceWith('aW5r');
  });

  it('captures a CSS pixel grid whose semantic coordinate dimensions are different', async () => {
    const viewBox = '-0.25 -0.125 1130 1306.5625';
    await act(async () => root.render(createElement(CaptureSvg, { ref, ...DIMENSIONS, viewBox })));
    const serialized = vi.spyOn(XMLSerializer.prototype, 'serializeToString');
    const { callback, loaded } = capture();
    expect(serialized.mock.results[0].value).toContain(`viewBox="${viewBox}"`);
    loaded();
    expect(callback).toHaveBeenCalledExactlyOnceWith('aW5r');
  });

  it('refuses a stale translated view box with the same rounded sampling grid', async () => {
    const viewBox = '-0.25 -0.125 1023.75 768.25';
    await act(async () => root.render(createElement(CaptureSvg, { ref, ...DIMENSIONS, viewBox })));
    host.querySelector('svg').setAttribute('viewBox', '-0.5 -0.125 1023.75 768.25');
    expect(() => ref.current.toDataURL(vi.fn(), DIMENSIONS)).toThrow('not ready');
    expect(images).toHaveLength(0);
  });

  it.each(['0 0 -1 768', '0 0 Infinity 768', 'NaN 0 1024 768', '0 0 1024 0'])(
    'refuses an invalid projection view box %s',
    async (viewBox) => {
      await act(async () =>
        root.render(createElement(CaptureSvg, { ref, ...DIMENSIONS, viewBox }))
      );
      expect(() => ref.current.toDataURL(vi.fn(), DIMENSIONS)).toThrow('not ready');
      expect(images).toHaveLength(0);
    }
  );

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

  it('captures the exact intrinsic grid despite fractional browser layout measurements', () => {
    vi.mocked(SVGSVGElement.prototype.getBoundingClientRect).mockReturnValue({
      width: 1023.997,
      height: 767.995,
    });
    const serialized = vi.spyOn(XMLSerializer.prototype, 'serializeToString');
    const { callback, loaded } = capture();
    expect(serialized.mock.results[0].value).toContain('viewBox="0 0 1024 768"');
    loaded();
    expect(callback).toHaveBeenCalledExactlyOnceWith('aW5r');
  });

  it.each(['width', 'height', 'viewBox'])(
    'refuses a changed intrinsic %s even when layout dimensions match',
    (attribute) => {
      host.querySelector('svg').setAttribute(attribute, '1');
      expect(() => ref.current.toDataURL(vi.fn(), DIMENSIONS)).toThrow('not ready');
      expect(images).toHaveLength(0);
    }
  );

  it('refuses missing or mismatched target/options instead of capturing another surface', () => {
    expect(() => ref.current.toDataURL(vi.fn(), { width: 1 })).toThrow('dimensions');
    expect(() => ref.current.toDataURL(vi.fn(), { width: 1024.5, height: 768 })).toThrow(
      'dimensions'
    );
    expect(() => ref.current.toDataURL(vi.fn(), { width: 768, height: 1024 })).toThrow('not ready');
    ref.current.elementRef = { current: document.createElement('div') };
    expect(() => ref.current.toDataURL(vi.fn(), DIMENSIONS)).toThrow('unavailable');
    expect(images).toHaveLength(0);
  });

  it('rasterizes a portrait paper at its own grid', async () => {
    const portrait = { width: 567, height: 1024 };
    vi.mocked(SVGSVGElement.prototype.getBoundingClientRect).mockReturnValue(portrait);
    await act(async () =>
      root.render(createElement(CaptureSvg, { ref, ...portrait, viewBox: '0 0 567 1024' }))
    );
    const serialized = vi.spyOn(XMLSerializer.prototype, 'serializeToString');
    const callback = vi.fn();
    const grids = [];
    draw.mockImplementation(() => grids.push([canvases.at(-1).width, canvases.at(-1).height]));
    ref.current.toDataURL(callback, portrait);
    expect(serialized.mock.results[0].value).toContain('viewBox="0 0 567 1024"');
    images.at(-1).onload();
    expect(grids).toEqual([[567, 1024]]);
    expect(callback).toHaveBeenCalledExactlyOnceWith('aW5r');
    expect(() => ref.current.toDataURL(vi.fn(), DIMENSIONS)).toThrow('not ready');
  });

  it('rasterizes its fixed grid into a saved picture larger than the grid', () => {
    const serialized = vi.spyOn(XMLSerializer.prototype, 'serializeToString');
    const callback = vi.fn();
    const grids = [];
    draw.mockImplementation(() => grids.push([canvases.at(-1).width, canvases.at(-1).height]));
    ref.current.toDataURL(callback, { width: 1537, height: 1153 });
    const source = serialized.mock.results[0].value;
    expect(source).toContain('viewBox="0 0 1024 768" width="1537" height="1153"');
    images.at(-1).onload();
    expect(grids).toEqual([[1537, 1153]]);
    expect(callback).toHaveBeenCalledExactlyOnceWith('aW5r');
  });

  async function renderFill(href) {
    await act(async () =>
      root.render(
        createElement(
          CaptureSvg,
          { ref, ...DIMENSIONS, viewBox: '0 0 1024 768' },
          createElement('image', { href, width: 10, height: 10 })
        )
      )
    );
  }

  it('copies a fill served as a file into the snapshot before rasterizing it', async () => {
    const WEBP = new Uint8Array([82, 73, 70, 70]);
    const fetched = vi.fn(async () => new Response(WEBP, { status: 200 }));
    vi.stubGlobal('fetch', fetched);
    await renderFill('/assets/farm/cat-wide.light.1.webp');
    const serialized = vi.spyOn(XMLSerializer.prototype, 'serializeToString');
    const callback = vi.fn();
    ref.current.toDataURL(callback, DIMENSIONS);
    expect(images).toHaveLength(0);
    await vi.waitFor(() => expect(images).toHaveLength(1));
    expect(fetched).toHaveBeenCalledExactlyOnceWith('/assets/farm/cat-wide.light.1.webp');
    const source = serialized.mock.results[0].value;
    expect(source).toContain(`href="data:`);
    expect(source).toContain(`;base64,${Buffer.from(WEBP).toString('base64')}"`);
    expect(source).not.toContain('/assets/farm/');
    images[0].onload();
    expect(callback).toHaveBeenCalledExactlyOnceWith('aW5r');
  });

  it('keeps a data-URI fill without fetching and rasterizes in the same call', async () => {
    const fetched = vi.fn();
    vi.stubGlobal('fetch', fetched);
    await renderFill('data:image/webp;base64,UklGRg==');
    capture();
    expect(images).toHaveLength(1);
    expect(fetched).not.toHaveBeenCalled();
  });

  it('fails closed when a fill served as a file does not load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 }))
    );
    await renderFill('/assets/farm/gone.webp');
    const callback = vi.fn();
    ref.current.toDataURL(callback, DIMENSIONS);
    await vi.waitFor(() => expect(callback).toHaveBeenCalledExactlyOnceWith(''));
    expect(images).toHaveLength(0);
  });

  it('drops a fetched fill whose capture was released before it arrived', async () => {
    let respond;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => (respond = resolve)))
    );
    await renderFill('/assets/farm/slow.webp');
    const callback = vi.fn();
    const release = ref.current.toDataURL(callback, DIMENSIONS);
    release();
    respond(new Response(new Uint8Array([1]), { status: 200 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(images).toHaveLength(0);
    expect(callback).not.toHaveBeenCalled();
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
