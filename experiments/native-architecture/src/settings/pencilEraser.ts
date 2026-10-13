// The Apple Pencil double-tap opt-out (ADR-0028): on by default, its Settings row revealed only
// once a double-tap has shown this device has a Pencil. native-pencil-double-tap.test.mjs pins the
// copy to the shipping ControlsSection.svelte row.
export type PencilSettings = Readonly<{ pencilEraserEnabled: boolean; applePencilSeen: boolean }>;
export const DEFAULT_PENCIL_SETTINGS: PencilSettings = {
  pencilEraserEnabled: true,
  applePencilSeen: false,
};
export const PENCIL_ERASER_LABEL = 'Apple Pencil double-tap to erase';
export const PENCIL_ERASER_HELP =
  'Double-tap an Apple Pencil to switch between drawing and erasing';

export function readPencilSettings(value: object): PencilSettings {
  const pencilEraserEnabled = 'pencilEraserEnabled' in value ? value.pencilEraserEnabled : null;
  const applePencilSeen = 'applePencilSeen' in value ? value.applePencilSeen : null;
  if (typeof pencilEraserEnabled !== 'boolean' || typeof applePencilSeen !== 'boolean')
    throw new Error('Apple Pencil choice is invalid.');
  return { pencilEraserEnabled, applePencilSeen };
}
