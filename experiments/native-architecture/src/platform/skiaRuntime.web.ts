// The web export paints ink and halos without Skia (InkLayer.web.tsx, PointerHalos.web.tsx), so
// Reanimated, the largest library Skia needs, stays off the web startup path.
export {};
