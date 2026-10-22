import type { BlobShape } from './blob';

// React Strict DOM styles neither `outline` nor `:focus-visible`, so the web export draws
// shipping's keyboard focus ring from global rules in src/strict.css. A control whose ring is not
// its own box marks where the ring goes instead, as shipping's per-component focus rules do; the
// native renderers drop these attributes. tools/tests/native-focus-ring.test.mjs mounts the shared
// controls against those rules.
type FocusRingHost =
  // The ring moves off the control onto a marked part: a hit area larger than the shape it shows.
  | 'part'
  // The ring is drawn inside the control's edge, where a clipping container would cut it off.
  | 'inset'
  // The ring follows the blob a control paints as a path, which its own box cannot round to.
  | BlobShape;

type FocusRingPart =
  // The part wears the ring itself.
  | 'ring'
  // The part's border turns brand with a soft brand halo around it, AiImagePrompt's style cover.
  | 'halo';

export function focusRingHost(mark: FocusRingHost) {
  return { 'data-focus-ring': mark } as const;
}

// react-native-web writes a View's dataSet out as data-* attributes.
export function focusRingHostView(mark: FocusRingHost) {
  return { dataSet: { focusRing: mark } } as const;
}

export function focusRingPart(mark: FocusRingPart) {
  return { 'data-focus-ring-part': mark } as const;
}
