export const ORIENTATION_CHOICES = ['portrait', 'landscape', 'auto'] as const;
export type OrientationChoice = (typeof ORIENTATION_CHOICES)[number];
export const ORIENTATION_LABELS: Record<OrientationChoice, string> = {
  portrait: 'Portrait',
  landscape: 'Landscape',
  auto: 'Auto',
};
export const AUTO_FOLLOWS_SYSTEM_ROTATION_NOTE = "Auto follows your device's rotation setting.";

export function isOrientationChoice(value: unknown): value is OrientationChoice {
  return ORIENTATION_CHOICES.some((choice) => choice === value);
}
