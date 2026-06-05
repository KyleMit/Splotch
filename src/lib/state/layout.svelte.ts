// Layout measurements published by the component that owns the element, so
// siblings can position against them without reaching across the DOM with a
// querySelector. That coupling tied callers to another component's CSS class
// names and forced a mount-time setTimeout to dodge layout races; reading the
// value reactively here removes both.
interface LayoutState {
  paletteWidth: number;
  gradientSwatchEl: HTMLElement | null;
}

export const layout: LayoutState = $state({
  // Rendered width of the color palette bar. ActionsPanel sits just past it
  // (paletteWidth + gap) in landscape so it clears the palette. 0 until the
  // palette has measured itself, so dependents settle once it lays out.
  paletteWidth: 0,

  // The custom-color (gradient) swatch button. ColorPicker reads its live
  // bounding rect to carve out a mis-tap block zone around it on the backdrop.
  gradientSwatchEl: null
});
