// @vitest-environment happy-dom
import { act, Component, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { CaptureSvg } from '../../src/drawing/CaptureSvg.android.tsx';

const device = vi.hoisted(() => ({ scale: 1, captures: [] }));
vi.mock('react-native', () => ({ PixelRatio: { get: () => device.scale } }));
vi.mock('react-native-svg', () => ({
  default: class Svg extends Component {
    toDataURL(callback, options) {
      device.captures.push(options);
      callback('png');
    }
    render() {
      return createElement('svg', {
        width: this.props.width,
        height: this.props.height,
        viewBox: this.props.viewBox,
      });
    }
  },
}));

let root;
let host;
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it.each([1, 2, 3.5])(
  'bounds the display bitmap at density %s while preserving explicit export pixels',
  async (scale) => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    device.scale = scale;
    device.captures.length = 0;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const ref = createRef();
    const raster = { width: 1536, height: 2560 };
    const viewBox = '0 0 438.857142857 731.428571429';
    await act(async () => root.render(createElement(CaptureSvg, { ...raster, viewBox, ref })));
    const svg = host.querySelector('svg');
    expect(Number(svg.getAttribute('width')) * scale).toBeCloseTo(raster.width);
    expect(Number(svg.getAttribute('height')) * scale).toBeCloseTo(raster.height);
    expect(svg.getAttribute('viewBox')).toBe(viewBox);
    const completed = vi.fn();
    ref.current.toDataURL(completed, raster);
    expect(device.captures).toEqual([raster]);
    expect(completed).toHaveBeenCalledExactlyOnceWith('png');
  }
);
