import type { SkPicture, SkiaPictureView } from '@shopify/react-native-skia';

type ViewApi = Readonly<{
  setJsiProperty: (nativeId: number, name: string, value: unknown) => void;
}>;

function isViewApi(value: unknown): value is ViewApi {
  return (
    typeof value === 'object' &&
    value !== null &&
    'setJsiProperty' in value &&
    typeof value.setJsiProperty === 'function'
  );
}

// SkiaPictureView hands its `picture` prop to the native view through Skia's JSI view API in its
// own componentDidUpdate. The ink layer calls the same setter on each display frame, so a new
// frame of ink renders no React; the view is never given a `picture` prop to overwrite it with.
export function showPicture(view: SkiaPictureView, picture: SkPicture) {
  const api: unknown = Reflect.get(globalThis, 'SkiaViewApi');
  if (!isViewApi(api)) throw new Error('The drawing paper could not be shown.');
  api.setJsiProperty(view.nativeId, 'picture', picture);
}

// The native picture view replaces the picture it draws on the JS thread while its render thread
// copies it to draw (RNSkPictureRenderer::setPicture and ::performDraw in react-native-skia's
// RNSkPictureView.h), and nothing orders the two. When the view's reference is a picture's last,
// replacing it can free the picture between the render thread reading the pointer and taking its
// own reference; the draw then calls into freed memory ("Pure virtual function called!" on
// Android). A picture the view was given therefore keeps a JavaScript reference until it has been
// out of the view for RETIRED_PICTURE_MS, far longer than that window stays open.
export const RETIRED_PICTURE_MS = 100;

export function createPictureRetirement() {
  const retired: { picture: SkPicture; at: number }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  function release() {
    const now = performance.now();
    while (retired.length > 0 && now - retired[0].at >= RETIRED_PICTURE_MS)
      retired.shift()?.picture.dispose();
  }
  // Once ink stops changing, no later retirement releases the last ones.
  function sweep() {
    timer = null;
    release();
    if (retired.length > 0) timer = setTimeout(sweep, RETIRED_PICTURE_MS);
  }
  return {
    // `picture` has just left the view, or will not reach it again.
    retire(picture: SkPicture) {
      retired.push({ picture, at: performance.now() });
      release();
      timer ??= setTimeout(sweep, RETIRED_PICTURE_MS);
    },
  };
}
