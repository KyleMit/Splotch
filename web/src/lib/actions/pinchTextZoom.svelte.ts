import { attachPinchTextZoom, type PinchTextZoomOptions } from './pinchTextZoomGesture';
export { attachPinchTextZoom, type PinchTextZoomOptions } from './pinchTextZoomGesture';
export { MIN_TEXT_ZOOM, MAX_TEXT_ZOOM, clampTextZoom, nextTextZoom } from './textZoom';

// Pinch-to-enlarge for a scrollable text pane (ADR-0076 tier 2). Unlike the
// transform-based `pinchZoom` used for the fixed-size AI preview, this drives CSS
// `zoom`, which reflows and extends the scroll container — so one finger keeps
// scrolling natively (this action never intercepts a single pointer) and only a
// two-finger pinch is captured to resize the text. On Firefox < 126 `zoom` is a
// no-op, so the pane simply stays at its normal size (scrolling is unaffected).
//
// The argument is a *getter* read inside a $effect (like `pinchZoom`), so the
// runes it touches — `enabled`, `resetKey`, the bound `target` — stay reactive.
export function pinchTextZoom(node: HTMLElement, getOptions: () => PinchTextZoomOptions) {
  const gesture = attachPinchTextZoom(node, getOptions);

  // Calling the option getter performs the reactive reads that subscribe this
  // effect to gate changes and overlay reopens.
  $effect(() => {
    getOptions();
    gesture.reset();
  });

  return { destroy: gesture.destroy };
}
