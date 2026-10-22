// The Actions Panel controls a parent can switch off from Settings. toolDrawerEnabled is the Tool
// Drawer section's own switch: off hides the drawer's own tools without touching their stored
// flags, so turning it back on restores the set the parent chose. screenshotEnabled is Saving's
// Camera button, which that switch never hides.
export type DrawingControlPreferences = Readonly<{
  undoButtonEnabled: boolean;
  strokeWidthControlEnabled: boolean;
  toolDrawerEnabled: boolean;
  screenshotEnabled: boolean;
}>;

export const DEFAULT_DRAWING_CONTROL_PREFERENCES: DrawingControlPreferences = {
  undoButtonEnabled: true,
  strokeWidthControlEnabled: true,
  toolDrawerEnabled: true,
  screenshotEnabled: true,
};

export type DrawerControl = 'undoButtonEnabled' | 'strokeWidthControlEnabled';

// Shipping's actionControlShown for the drawer's own controls: on, and the drawer itself on.
export function drawerControlShown(
  preferences: DrawingControlPreferences,
  control: DrawerControl
): boolean {
  return preferences[control] && preferences.toolDrawerEnabled;
}

function readFlag(flag: unknown, key: keyof DrawingControlPreferences): boolean {
  if (flag === undefined) return DEFAULT_DRAWING_CONTROL_PREFERENCES[key];
  if (typeof flag !== 'boolean') throw new Error('Drawing control choices are invalid.');
  return flag;
}

export function readDrawingControlPreferences(value: object): DrawingControlPreferences {
  return {
    undoButtonEnabled: readFlag(
      'undoButtonEnabled' in value ? value.undoButtonEnabled : undefined,
      'undoButtonEnabled'
    ),
    strokeWidthControlEnabled: readFlag(
      'strokeWidthControlEnabled' in value ? value.strokeWidthControlEnabled : undefined,
      'strokeWidthControlEnabled'
    ),
    toolDrawerEnabled: readFlag(
      'toolDrawerEnabled' in value ? value.toolDrawerEnabled : undefined,
      'toolDrawerEnabled'
    ),
    screenshotEnabled: readFlag(
      'screenshotEnabled' in value ? value.screenshotEnabled : undefined,
      'screenshotEnabled'
    ),
  };
}
