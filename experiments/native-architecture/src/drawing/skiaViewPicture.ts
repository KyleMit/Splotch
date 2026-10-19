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
// The native view keeps its own reference to the picture it holds, so the caller may release the
// one before as soon as this returns. That relies on the react-native-skia patch in `patches/`:
// unpatched, the view replaces its picture on this thread while its render thread copies it with
// nothing ordering the two, and dropping a replaced picture's last reference can free it mid-draw
// ("Pure virtual function called!" on Android). native-picture-lifetime.test.mjs reads both.
export function showPicture(view: SkiaPictureView, picture: SkPicture) {
  const api: unknown = Reflect.get(globalThis, 'SkiaViewApi');
  if (!isViewApi(api)) throw new Error('The drawing paper could not be shown.');
  api.setJsiProperty(view.nativeId, 'picture', picture);
}
