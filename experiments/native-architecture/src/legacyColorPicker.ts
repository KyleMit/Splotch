import { lazySurface } from './rsdDrawing/lazySurface';

// The legacy DrawingScreen's one React Strict DOM surface loads on first open, so the suites that
// mount that screen on react-native-web need the React Strict DOM renderer only to open the picker.
export const RsdColorPicker = lazySurface(() =>
  import('./rsdDrawing/RsdColorPicker').then((module) => module.RsdColorPicker)
);
