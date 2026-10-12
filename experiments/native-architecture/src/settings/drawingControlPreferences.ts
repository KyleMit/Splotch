export type DrawingControlPreferences = Readonly<{
  undoButtonEnabled: boolean;
  strokeWidthControlEnabled: boolean;
}>;

export const DEFAULT_DRAWING_CONTROL_PREFERENCES: DrawingControlPreferences = {
  undoButtonEnabled: true,
  strokeWidthControlEnabled: true,
};

export function readDrawingControlPreferences(value: object): DrawingControlPreferences {
  const undoButtonEnabled =
    'undoButtonEnabled' in value
      ? value.undoButtonEnabled
      : DEFAULT_DRAWING_CONTROL_PREFERENCES.undoButtonEnabled;
  const strokeWidthControlEnabled =
    'strokeWidthControlEnabled' in value
      ? value.strokeWidthControlEnabled
      : DEFAULT_DRAWING_CONTROL_PREFERENCES.strokeWidthControlEnabled;
  if (typeof undoButtonEnabled !== 'boolean' || typeof strokeWidthControlEnabled !== 'boolean')
    throw new Error('Drawing control choices are invalid.');
  return { undoButtonEnabled, strokeWidthControlEnabled };
}
