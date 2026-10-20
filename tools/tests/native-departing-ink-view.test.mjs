// @vitest-environment happy-dom
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const views = vi.hoisted(() => ({ next: 1, constructed: [], pictures: [], shown: [] }));

vi.mock('react-native', async () => import('react-native-web'));
vi.mock('@shopify/react-native-skia', async () => {
  const { recordingSkiaModule } = await import('./native-skia-recording-fixture.mjs');
  const skia = recordingSkiaModule({ nativeId: () => views.next++ });
  const record = skia.Skia.PictureRecorder;
  skia.Skia.PictureRecorder = () => {
    const recorder = record();
    return {
      beginRecording: recorder.beginRecording,
      finishRecordingAsPicture: () => {
        const picture = { ...recorder.finishRecordingAsPicture(), dispose: vi.fn() };
        views.pictures.push(picture);
        return picture;
      },
    };
  };
  class SkiaPictureView extends skia.SkiaPictureView {
    constructor(props) {
      super(props);
      views.constructed.push({ id: this.nativeId, props });
    }
  }
  return { ...skia, SkiaPictureView };
});
import { DepartingInkView } from '../../experiments/native-architecture/src/rsdDrawing/DepartingInkView.tsx';

beforeEach(() => {
  globalThis.SkiaViewApi = {
    setJsiProperty: (id, name, value) => views.shown.push({ id, name, value }),
  };
});
afterEach(() => {
  delete globalThis.SkiaViewApi;
  Object.assign(views, { next: 1, constructed: [], pictures: [], shown: [] });
});

// SkiaPictureView's constructor submits a `picture` prop to the native registry at once; under
// StrictMode the instance React discards would keep its full-page pixels with nothing to release
// them (PR 3036 review).
it('hands the departing picture to the mounted view alone and releases each one it recorded', async () => {
  const ink = { image: { dispose: vi.fn() }, paper: { x: 10, y: 20, width: 800, height: 600 } };
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(DepartingInkView, { ink, width: 400, height: 300 })
      )
    )
  );
  expect(views.constructed.length).toBeGreaterThan(0);
  expect(views.constructed.filter(({ props }) => 'picture' in props)).toEqual([]);
  const live = views.pictures.filter((picture) => picture.dispose.mock.calls.length === 0);
  expect(live).toHaveLength(1);
  expect(views.shown.at(-1)).toMatchObject({ name: 'picture', value: live[0] });
  expect(views.constructed.map(({ id }) => id)).toContain(views.shown.at(-1).id);
  expect(live[0].calls[0].slice(0, 4)).toEqual([
    'drawImageRectOptions',
    ink.image,
    { x: 10, y: 20, width: 800, height: 600 },
    { x: 0, y: 0, width: 400, height: 300 },
  ]);
  await act(async () => root.unmount());
  expect(views.pictures.every((picture) => picture.dispose.mock.calls.length === 1)).toBe(true);
  expect(ink.image.dispose).not.toHaveBeenCalled();
});
